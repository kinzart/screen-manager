const fs = require("fs");
const { JSDOM } = require("jsdom");

if (!fs.readFileSync("src/display.html", "utf8").includes('src="logo-bs.png"'))
  throw new Error("Tela de saida nao usa src/logo-bs.png como logo");

const html = fs
  .readFileSync("src/control.html", "utf8")
  .replace('<script src="control.js"></script>', "");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "file:///control.html",
});
const { window } = dom;
window.confirm = () => true;
const opened = [];
window.fbs = {
  loadPlaylist: async () => [
    {
      id: "a",
      path: "C:\\media\\a.jpg",
      name: "a.jpg",
      type: "image",
      duration: 0.25,
      transition: "",
      fit: "contain",
      startAt: "",
    },
    {
      id: "b",
      path: "C:\\media\\b.jpg",
      name: "b.jpg",
      type: "image",
      duration: 10,
      transition: "",
      fit: "contain",
      startAt: "",
    },
  ],
  savePlaylist: async () => true,
  loadSettings: async () => ({ rules: [] }),
  saveSettings: async () => true,
  listDisplays: async () => [],
  selectDisplay: async () => "1",
  validateFiles: async (x) => x,
  chooseFiles: async () => [],
  filePaths: () => ["C:\\media\\drop.mp4"],
  openFile: async (path) => {
    opened.push(["file", path]);
    return { ok: true };
  },
  showInFolder: async (path) => {
    opened.push(["folder", path]);
    return { ok: true };
  },
  command: () => {},
  onStatus: () => {},
  onDisplays: () => {},
};
window.eval(fs.readFileSync("src/control.js", "utf8"));

(async () => {
  await new Promise((r) => setTimeout(r, 100));
  const duration = window.document.querySelector(".duration");
  duration.focus();
  await new Promise((r) => setTimeout(r, 1200));
  if (window.document.querySelector(".duration") !== duration)
    throw new Error("A lista foi reconstruída pelo agendador");
  if (window.document.activeElement !== duration)
    throw new Error("O campo perdeu o foco sozinho");
  const drag = new window.Event("dragstart", {
    bubbles: true,
    cancelable: true,
  });
  drag.dataTransfer = { setData() {}, effectAllowed: "" };
  duration.dispatchEvent(drag);
  if (!drag.defaultPrevented)
    throw new Error("Um campo editável iniciou arraste");
  window.document.querySelector('[data-id="b"] .move-up').click();
  if (window.document.querySelector(".item").dataset.id !== "b")
    throw new Error("A seta não alterou a ordem");
  const dragRow = new window.Event("dragstart", {
    bubbles: true,
    cancelable: true,
  });
  dragRow.dataTransfer = {
    setData() {},
    setDragImage() {},
    effectAllowed: "",
    dropEffect: "",
  };
  window.document.querySelector('[data-id="b"] .meta').dispatchEvent(dragRow);
  const dropOnSecond = new window.Event("drop", {
    bubbles: true,
    cancelable: true,
  });
  dropOnSecond.dataTransfer = { dropEffect: "" };
  window.document.querySelector('[data-id="a"]').dispatchEvent(dropOnSecond);
  if (window.document.querySelector(".item").dataset.id !== "a")
    throw new Error("Arrastar a linha nao reordenou a fila");
  window.document.querySelector("#lockBtn").click();
  window.document.querySelector("#pauseBtn").click();
  await new Promise((r) => setTimeout(r, 700));
  if (window.document.querySelector("#currentName").textContent !== "a.jpg")
    throw new Error("Item bloqueado avancou sozinho ao fim da duracao");
  if (!window.document.querySelector("#loopBtn").classList.contains("active"))
    throw new Error("Loop nao iniciou ligado");
  window.document.querySelector("#loopBtn").click();
  if (window.document.querySelector("#loopBtn").textContent !== "Loop desligado")
    throw new Error("Botao de loop nao alternou o estado");
  if (window.document.querySelectorAll(".file-row").length !== 2)
    throw new Error("Painel de arquivos nao listou a fila");
  window.document.querySelector(".open-file").click();
  window.document.querySelector(".open-folder").click();
  await new Promise((r) => setTimeout(r, 20));
  if (opened.length !== 2)
    throw new Error("Acoes de abrir arquivo/pasta nao foram chamadas");
  const drop = new window.Event("drop", { bubbles: true, cancelable: true });
  drop.dataTransfer = { types: ["Files"], files: [{ name: "drop.mp4" }] };
  window.document.dispatchEvent(drop);
  await new Promise((r) => setTimeout(r, 50));
  if (!window.document.querySelector('[data-id] .meta strong[title="drop.mp4"]'))
    throw new Error("Drop de arquivos nao adicionou midia pela API do preload");
  await new Promise((r) => setTimeout(r, 50));
  console.log("PASS: foco estavel, drag/drop, loop, setas e painel de arquivos");
  window.close();
})().catch((error) => {
  console.error(error);
  window.close();
  process.exitCode = 1;
});
