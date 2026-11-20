let remoteEnabled = false;
let cloudRemote = { enabled: false };
function renderCloudRemote(cloud = {}) {
  cloudRemote = cloud;
  const url = $("#cloudServerUrl"), room = $("#cloudRoom"), token = $("#cloudToken");
  if (document.activeElement !== url && cloud.serverUrl) url.value = cloud.serverUrl;
  if (document.activeElement !== room && cloud.room) room.value = cloud.room;
  if (document.activeElement !== token && cloud.token) token.value = cloud.token;
  const connected = cloud.enabled && cloud.connected;
  $("#cloudStatus").textContent = connected
    ? `Relay conectado · sala ${cloud.room || "—"}`
    : cloud.enabled ? (cloud.lastError || "Conectando ao relay…") : "Relay desativado.";
  $("#cloudControllerToken").textContent = cloud.controllerToken || "—";
  $("#cloudPhoneInfo").hidden = !cloud.controllerToken;
}
function showConnections({ output, remote, displays }) {
  const wasBlocked = outputBlocked;
  outputBlocked = output.blocked;
  remoteEnabled = remote.enabled;
  $("#outputStatus").textContent = [output.name, output.message, output.attempt && "Tentativa " + output.attempt].filter(Boolean).join(" · ");
  $("#connections").classList.toggle("waiting", outputBlocked);
  $("#displaySelect").title = $("#outputStatus").textContent;
  $("#castField").hidden = output.kind !== "wireless";
  if (document.activeElement !== $("#castName")) $("#castName").value = output.castName || "";
  loadDisplays(displays);
  if (wasBlocked !== outputBlocked) { updateStatus(); publish(); }
  $("#shareToggle").textContent = remote.enabled ? "Desativar acesso remoto" : "Ativar acesso pelo celular e TV";
  $("#shareInfo").hidden = !remote.enabled;
  $("#shareError").textContent = remote.error || "";
  renderCloudRemote(remote.cloud || {});
  if (!remote.enabled) return;
  $("#shareAddresses").replaceChildren(...remote.urls.map(address => {
    const node = document.createElement("code"); node.textContent = address; return node;
  }));
  $("#phoneCode").textContent = remote.codes.control || "—";
  $("#tvCode").textContent = remote.codes.tv || "—";
  $("#pairExpiry").textContent = "Na TV, acrescente /tv ao endereço. Códigos de uso único, válidos até " +
    new Date(remote.expires).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + ".";
  $("#clientCount").textContent = `Controles conectados: ${remote.controls} · TVs: ${remote.televisions}`;
}
$("#shareToggle").onclick = async () => {
  $("#shareToggle").disabled = true;
  try { await window.fbs.enableRemote(!remoteEnabled); }
  catch (error) { toast(error.message); }
  finally { $("#shareToggle").disabled = false; }
};
$("#cloudProvision").onclick = async () => {
  const button = $("#cloudProvision");
  button.disabled = true;
  try {
    const result = await window.fbs.provisionCloudRemote($("#cloudServerUrl").value);
    renderCloudRemote(result.cloud || {});
    if (result.provisioned?.controllerToken) $("#cloudControllerToken").textContent = result.provisioned.controllerToken;
    toast("Sessão remota criada. Guarde o token do controle móvel.");
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
};
$("#cloudConnect").onclick = async () => {
  try {
    const result = await window.fbs.configureCloudRemote({ enabled: true, serverUrl: $("#cloudServerUrl").value, room: $("#cloudRoom").value, token: $("#cloudToken").value, controllerToken: $("#cloudControllerToken").textContent === "—" ? "" : $("#cloudControllerToken").textContent });
    renderCloudRemote(result.cloud || {});
  } catch (error) { toast(error.message); }
};
$("#cloudDisconnect").onclick = () => window.fbs.configureCloudRemote({ enabled: false }).catch(error => toast(error.message));
$("#renewCodes").onclick = () => window.fbs.renewCodes().catch(error => toast(error.message));
$("#saveCast").onclick = () => window.fbs.setCastName($("#castName").value).catch(error => toast(error.message));
window.fbs.onConnection(showConnections);
window.fbs.connection().then(showConnections).catch(error => toast(error.message));

const editableTransitions = ["cut", "fade", "slide-left", "slide-up", "zoom"];
const timeOfDay = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
async function remoteAction(c) {
  const item = playlist.find(x => x.id === c.id);
  const rule = settings.rules.find(x => x.id === c.id);
  if (["take", "edit", "move", "remove", "showFolder"].includes(c.action) && !item) throw new Error("O item já saiu da fila.");
  if (["editRule", "removeRule"].includes(c.action) && !rule) throw new Error("A regra já foi removida.");
  switch (c.action) {
    case "play":
      if (!playlist.length) throw new Error("Adicione uma mídia à fila.");
      if (!running || paused) toggle();
      break;
    case "pause": if (running && !paused) toggle(); break;
    case "previous": next(-1); break;
    case "next": next(); break;
    case "take": take(item.id); break;
    case "lock": if (locked !== !!c.value) $("#lockBtn").click(); break;
    case "loop": if (settings.loopPlaylist !== !!c.value) $("#loopBtn").click(); break;
    case "blackout": case "logo": command(c.action); updateStatus(); break;
    case "move": if (c.delta === 1 || c.delta === -1) moveItem(item.id, c.delta); break;
    case "remove":
      playlist = playlist.filter(x => x !== item);
      if (currentId === item.id) { currentId = null; stop(); }
      render(); await save(); break;
    case "clear": playlist = []; currentId = null; stop(); render(); await save(); break;
    case "edit":
      if (!(c.field === "duration" && Number.isFinite(c.value) && c.value >= 0 && c.value <= 86400 ||
            c.field === "startAt" && (c.value === "" || typeof c.value === "string" && timeOfDay.test(c.value)) ||
            c.field === "transition" && (c.value === "" || editableTransitions.includes(c.value)))) throw new Error("Valor de mídia inválido.");
      update(item.id, c.field, c.value); render(); break;
    case "addRule": $("#addRule").click(); break;
    case "editRule":
      if (!(["start","end"].includes(c.field) && typeof c.value === "string" && c.value.length === 5 && timeOfDay.test(c.value) ||
            c.field === "transition" && editableTransitions.includes(c.value))) throw new Error("Valor de regra inválido.");
      rule[c.field] = c.value; renderRules(); await save(); break;
    case "removeRule": settings.rules = settings.rules.filter(x => x !== rule); renderRules(); await save(); break;
    case "display": await window.fbs.selectDisplay(c.id); break;
    case "showFolder": {
      const result = await window.fbs.showInFolder(item.path);
      if (!result?.ok) throw new Error("A pasta do arquivo está indisponível no computador.");
      break;
    }
    case "import": await addFiles([c.file], c.name); break;
    default: throw new Error("Comando inválido.");
  }
  publish();
}
window.fbs.onAction(async ({ id, command }) => {
  try { await remoteAction(command); window.fbs.actionResult({ id }); }
  catch (error) { window.fbs.actionResult({ id, error: error.message }); }
});
