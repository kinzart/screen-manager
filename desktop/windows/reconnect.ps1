[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Identify', 'Reconnect')]
    [string] $Mode,
    [int] $X = 0,
    [int] $Y = 0,
    [string] $Kind = '',
    [string] $DeviceNameBase64 = '',
    [string] $DevicePathBase64 = '',
    [string] $CastNameBase64 = ''
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

function Decode-Argument([string] $Value, [int] $Maximum) {
    $decoder = New-Object System.Text.UTF8Encoding($false, $true)
    $decoded = $decoder.GetString([Convert]::FromBase64String($Value))
    if ([string]::IsNullOrWhiteSpace($decoded) -or $decoded.Length -gt $Maximum -or
        $decoded -match '[\x00-\x1f\x7f]') {
        throw 'Identidade ou nome de transmissão inválido.'
    }
    return $decoded
}

try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    Add-Type -AssemblyName WindowsBase
    $references = @(
        'System.dll',
        [System.Windows.Automation.AutomationElement].Assembly.Location,
        [System.Windows.Automation.ControlType].Assembly.Location,
        [System.Windows.Threading.Dispatcher].Assembly.Location
    ) | Select-Object -Unique

    Add-Type -ReferencedAssemblies $references -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

namespace Fbs.WindowsDisplay
{
    public sealed class Identity
    {
        public string Kind;
        public string DeviceName;
        public string DevicePath;
    }

    public static class Native
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct Luid { public uint Low; public int High; }
        [StructLayout(LayoutKind.Sequential)]
        private struct Rect { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct MonitorInfo
        {
            public uint Size;
            public Rect Monitor, Work;
            public uint Flags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Device;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct SourceInfo
        {
            public Luid Adapter;
            public uint Id, ModeIndex, Status;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct Rational { public uint Numerator, Denominator; }
        [StructLayout(LayoutKind.Sequential)]
        private struct TargetInfo
        {
            public Luid Adapter;
            public uint Id, ModeIndex, Technology, Rotation, Scaling;
            public Rational Refresh;
            public uint ScanLine;
            [MarshalAs(UnmanagedType.Bool)] public bool Available;
            public uint Status;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct PathInfo
        {
            public SourceInfo Source;
            public TargetInfo Target;
            public uint Flags;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct Header
        {
            public uint Type, Size;
            public Luid Adapter;
            public uint Id;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct SourceName
        {
            public Header Header;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Name;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct TargetName
        {
            public Header Header;
            public uint Flags, Technology;
            public ushort Manufacturer, Product;
            public uint Connector;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string Name;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DevicePath;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct TargetBaseType
        {
            public Header Header;
            public uint Technology;
        }
        private sealed class ActiveTarget
        {
            public string Source;
            public Identity Identity;
        }
        private delegate bool MonitorCallback(IntPtr monitor, IntPtr dc, ref Rect bounds, IntPtr data);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorCallback callback, IntPtr data);
        [DllImport("user32.dll", EntryPoint = "GetMonitorInfoW", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
        [DllImport("user32.dll")]
        private static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
        [DllImport("user32.dll")]
        private static extern int QueryDisplayConfig(uint flags, ref uint pathCount,
            [Out] PathInfo[] paths, ref uint modeCount, IntPtr modes, IntPtr topology);
        [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
        private static extern int GetSourceName(ref SourceName request);
        [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
        private static extern int GetTargetName(ref TargetName request);
        [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
        private static extern int GetTargetBaseType(ref TargetBaseType request);

        private static Header MakeHeader(uint type, Type structure, Luid adapter, uint id)
        {
            return new Header { Type = type, Size = (uint)Marshal.SizeOf(structure), Adapter = adapter, Id = id };
        }

        private static string Classify(uint technology)
        {
            if (technology == 15) return "wireless";
            switch (technology)
            {
                case 0: case 1: case 2: case 3: case 4: case 5: case 6:
                case 8: case 9: case 10: case 11: case 12: case 13: case 14:
                case 16: case 18: case 0x80000000u:
                    return "wired";
                default: return "unknown";
            }
        }

        private static List<ActiveTarget> ReadActiveTargets()
        {
            // Sem VIRTUAL_MODE_AWARE, DISPLAYCONFIG_MODE_INFO tem 64 bytes.
            const uint activeOnly = 2;
            for (int attempt = 0; attempt < 4; attempt++)
            {
                uint pathCount, modeCount;
                int error = GetDisplayConfigBufferSizes(activeOnly, out pathCount, out modeCount);
                if (error != 0) throw new Win32Exception(error);
                if (pathCount > 4096 || modeCount > 16384) throw new InvalidOperationException("Topologia inválida.");
                if (pathCount == 0) return new List<ActiveTarget>();
                PathInfo[] paths = new PathInfo[pathCount];
                IntPtr modes = Marshal.AllocHGlobal(checked((int)Math.Max(1u, modeCount) * 64));
                try
                {
                    error = QueryDisplayConfig(activeOnly, ref pathCount, paths, ref modeCount, modes, IntPtr.Zero);
                    if (error == 122) continue;
                    if (error != 0) throw new Win32Exception(error);
                    List<ActiveTarget> result = new List<ActiveTarget>();
                    for (int i = 0; i < pathCount; i++)
                    {
                        PathInfo path = paths[i];
                        if ((path.Flags & 1) == 0) continue;
                        SourceName source = new SourceName();
                        source.Header = MakeHeader(1, typeof(SourceName), path.Source.Adapter, path.Source.Id);
                        TargetName target = new TargetName();
                        target.Header = MakeHeader(2, typeof(TargetName), path.Target.Adapter, path.Target.Id);
                        error = GetSourceName(ref source);
                        if (error != 0) throw new Win32Exception(error);
                        error = GetTargetName(ref target);
                        if (error != 0) throw new Win32Exception(error);
                        if (String.IsNullOrWhiteSpace(source.Name) || String.IsNullOrWhiteSpace(target.Name) ||
                            String.IsNullOrWhiteSpace(target.DevicePath))
                            throw new InvalidOperationException("O Windows não forneceu uma identidade completa.");
                        TargetBaseType baseType = new TargetBaseType();
                        // DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_BASE_TYPE = 6.
                        baseType.Header = MakeHeader(6, typeof(TargetBaseType), path.Target.Adapter, path.Target.Id);
                        string kind = GetTargetBaseType(ref baseType) == 0 ? Classify(baseType.Technology) : "unknown";
                        result.Add(new ActiveTarget {
                            Source = source.Name,
                            Identity = new Identity { Kind = kind, DeviceName = target.Name, DevicePath = target.DevicePath }
                        });
                    }
                    return result;
                }
                finally { Marshal.FreeHGlobal(modes); }
            }
            throw new InvalidOperationException("A topologia mudou durante a consulta.");
        }

        public static Identity Identify(int x, int y)
        {
            IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
            if (previous == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            List<string> matchingMonitors = new List<string>();
            bool failed = false;
            try
            {
                MonitorCallback callback = delegate(IntPtr monitor, IntPtr dc, ref Rect bounds, IntPtr data)
                {
                    MonitorInfo info = new MonitorInfo();
                    info.Size = (uint)Marshal.SizeOf(typeof(MonitorInfo));
                    if (!GetMonitorInfo(monitor, ref info)) { failed = true; return true; }
                    if (x >= info.Monitor.Left && x < info.Monitor.Right &&
                        y >= info.Monitor.Top && y < info.Monitor.Bottom)
                        matchingMonitors.Add(info.Device);
                    return true;
                };
                if (!EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, callback, IntPtr.Zero) || failed)
                    throw new InvalidOperationException("Não foi possível consultar os monitores físicos.");
            }
            finally { SetThreadDpiAwarenessContext(previous); }
            if (matchingMonitors.Count != 1) return null;
            List<ActiveTarget> targets = ReadActiveTargets();
            ActiveTarget match = null;
            int count = 0;
            foreach (ActiveTarget target in targets)
                if (String.Equals(target.Source, matchingMonitors[0], StringComparison.OrdinalIgnoreCase))
                { match = target; count++; }
            // Um mesmo source com vários targets é clone/duplicação: não escolher um deles.
            if (count != 1) return null;
            int samePath = 0;
            foreach (ActiveTarget target in targets)
                if (String.Equals(target.Identity.DevicePath, match.Identity.DevicePath, StringComparison.OrdinalIgnoreCase))
                    samePath++;
            return samePath == 1 ? match.Identity : null;
        }

        [DllImport("user32.dll")]
        private static extern int SetDisplayConfig(uint paths, IntPtr pathInfo, uint modes, IntPtr modeInfo, uint flags);

        private static string ConnectedStatus(string deviceName, string devicePath)
        {
            List<ActiveTarget> targets = ReadActiveTargets();
            ActiveTarget selected = null;
            int matches = 0;
            foreach (ActiveTarget target in targets)
                if (target.Identity.Kind == "wireless" &&
                    String.Equals(target.Identity.DevicePath, devicePath, StringComparison.OrdinalIgnoreCase) &&
                    String.Equals(target.Identity.DeviceName, deviceName, StringComparison.Ordinal))
                { selected = target; matches++; }
            if (matches != 1) return null;
            int clones = targets.FindAll(delegate(ActiveTarget t) {
                return String.Equals(t.Source, selected.Source, StringComparison.OrdinalIgnoreCase);
            }).Count;
            if (clones > 1) {
                // The remembered target previously had its own desktop. Restore that layout
                // only for the unambiguous PC + TV pair. Preserve larger event topologies.
                const uint extend = 4, apply = 0x80;
                if (targets.Count == 2 && SetDisplayConfig(0, IntPtr.Zero, 0, IntPtr.Zero, extend | apply) == 0)
                    return "TV reconectada. O Windows está restaurando o modo Estender.";
                return "TV reconectada em modo Duplicar. Use Windows + P e selecione Estender.";
            }
            return "A TV está presente na topologia ativa do Windows.";
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct WlanInterface
        {
            public Guid Id;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Description;
            public uint State;
        }
        [DllImport("wlanapi.dll")]
        private static extern uint WlanOpenHandle(uint version, IntPtr reserved, out uint negotiated, out IntPtr handle);
        [DllImport("wlanapi.dll")]
        private static extern uint WlanCloseHandle(IntPtr handle, IntPtr reserved);
        [DllImport("wlanapi.dll")]
        private static extern uint WlanEnumInterfaces(IntPtr handle, IntPtr reserved, out IntPtr list);
        [DllImport("wlanapi.dll")]
        private static extern uint WlanQueryInterface(IntPtr handle, ref Guid id, uint opcode,
            IntPtr reserved, out uint size, out IntPtr data, out uint valueType);
        [DllImport("wlanapi.dll")]
        private static extern void WlanFreeMemory(IntPtr memory);

        private static string CheckWifi()
        {
            IntPtr handle;
            uint negotiated;
            if (WlanOpenHandle(2, IntPtr.Zero, out negotiated, out handle) != 0)
                return "O serviço Wi-Fi está indisponível. Verifique o Wi-Fi do Windows antes de tentar novamente.";
            IntPtr list = IntPtr.Zero;
            try
            {
                if (WlanEnumInterfaces(handle, IntPtr.Zero, out list) != 0 || list == IntPtr.Zero)
                    return "Não foi possível consultar os adaptadores Wi-Fi do Windows.";
                int count = Marshal.ReadInt32(list);
                if (count == 0) return "Nenhum adaptador Wi-Fi está disponível para a conexão com a TV.";
                if (count < 0 || count > 256) return "O Windows retornou uma lista Wi-Fi inválida.";
                bool inspected = false;
                int interfaceSize = Marshal.SizeOf(typeof(WlanInterface));
                for (int i = 0; i < count; i++)
                {
                    WlanInterface item = (WlanInterface)Marshal.PtrToStructure(
                        IntPtr.Add(list, 8 + i * interfaceSize), typeof(WlanInterface));
                    IntPtr data = IntPtr.Zero;
                    try
                    {
                        uint size, valueType;
                        // wlan_intf_opcode_radio_state = 4; consulta somente, sem alterar rádio.
                        uint error = WlanQueryInterface(handle, ref item.Id, 4, IntPtr.Zero, out size, out data, out valueType);
                        if (error != 0 || data == IntPtr.Zero || size < 4) continue;
                        int radios = Marshal.ReadInt32(data);
                        if (radios < 1 || radios > 64 || size < 4u + (uint)radios * 12u) continue;
                        inspected = true;
                        for (int radio = 0; radio < radios; radio++)
                        {
                            int software = Marshal.ReadInt32(data, 4 + radio * 12 + 4);
                            int hardware = Marshal.ReadInt32(data, 4 + radio * 12 + 8);
                            if (software == 1 && hardware == 1) return null;
                        }
                    }
                    finally { if (data != IntPtr.Zero) WlanFreeMemory(data); }
                }
                return inspected
                    ? "O rádio Wi-Fi não está disponível. Verifique o Wi-Fi e o modo avião; nenhum rádio foi alterado."
                    : "Não foi possível verificar o estado do rádio Wi-Fi. Nenhuma conexão foi solicitada.";
            }
            finally
            {
                if (list != IntPtr.Zero) WlanFreeMemory(list);
                WlanCloseHandle(handle, IntPtr.Zero);
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MouseInput
        {
            public int X, Y;
            public uint Data, Flags, Time;
            public UIntPtr Extra;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct KeyboardInput
        {
            public ushort Key, Scan;
            public uint Flags, Time;
            public UIntPtr Extra;
        }
        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public MouseInput Mouse;
            [FieldOffset(0)] public KeyboardInput Keyboard;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct Input { public uint Type; public InputUnion Data; }
        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint count, Input[] inputs, int size);
        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("user32.dll")]
        private static extern IntPtr GetAncestor(IntPtr window, uint flags);

        private static Input Key(ushort key, bool release)
        {
            Input result = new Input();
            result.Type = 1;
            result.Data.Keyboard.Key = key;
            result.Data.Keyboard.Flags = release ? 2u : 0u;
            return result;
        }

        private static void OpenCast()
        {
            Input[] keys = { Key(0x5b, false), Key(0x4b, false), Key(0x4b, true), Key(0x5b, true) };
            if (SendInput((uint)keys.Length, keys, Marshal.SizeOf(typeof(Input))) != keys.Length)
            {
                Input[] release = { Key(0x4b, true), Key(0x5b, true) };
                SendInput((uint)release.Length, release, Marshal.SizeOf(typeof(Input)));
                throw new InvalidOperationException("O Windows não abriu o painel de transmissão.");
            }
        }

        private static bool TrustedShell(int processId)
        {
            try
            {
                using (Process process = Process.GetProcessById(processId))
                {
                    string executable = Path.GetFullPath(process.MainModule.FileName);
                    string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                    string file = Path.GetFileName(executable);
                    if (String.Equals(executable, Path.Combine(windows, "explorer.exe"), StringComparison.OrdinalIgnoreCase))
                        return true;
                    if (!String.Equals(file, "ShellExperienceHost.exe", StringComparison.OrdinalIgnoreCase) &&
                        !String.Equals(file, "ShellHost.exe", StringComparison.OrdinalIgnoreCase)) return false;
                    return executable.StartsWith(Path.Combine(windows, "SystemApps") + Path.DirectorySeparatorChar,
                               StringComparison.OrdinalIgnoreCase) ||
                        String.Equals(executable, Path.Combine(windows, "System32", "ShellHost.exe"), StringComparison.OrdinalIgnoreCase);
                }
            }
            catch { return false; }
        }

        private static bool CastTitle(string value)
        {
            // Títulos exatos dos painéis de envio, em inglês e português.
            return value == "Cast" || value == "Connect" || value == "Transmitir" || value == "Conectar" || value == "Ligar";
        }

        private static bool CastClass(string value)
        {
            return value == "Windows.UI.Core.CoreWindow" || value == "ControlCenterWindow" ||
                value == "TopLevelWindowForOverflowXamlIsland" || value == "XamlExplorerHostIslandWindow" ||
                value == "Xaml_WindowedPopupClass";
        }

        private static List<AutomationElement> CastScopes()
        {
            List<AutomationElement> result = new List<AutomationElement>();
            AutomationElementCollection roots = AutomationElement.RootElement.FindAll(TreeScope.Children, Condition.TrueCondition);
            foreach (AutomationElement root in roots)
            {
                try
                {
                    AutomationElement.AutomationElementInformation info = root.Current;
                    if (info.IsOffscreen || !info.IsEnabled || !CastClass(info.ClassName) ||
                        info.NativeWindowHandle == 0 || !TrustedShell(info.ProcessId)) continue;
                    IntPtr window = new IntPtr(info.NativeWindowHandle);
                    uint owner;
                    GetWindowThreadProcessId(window, out owner);
                    if (owner != (uint)info.ProcessId || GetAncestor(window, 2) != window) continue;
                    if (CastTitle(info.Name)) { result.Add(root); continue; }
                    // Algumas versões hospedam o flyout nomeado dentro de uma janela sem título.
                    // Somente esse contêiner nomeado será pesquisado, nunca a janela genérica.
                    Condition containers = new OrCondition(
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Pane),
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Group),
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window));
                    foreach (AutomationElement child in root.FindAll(TreeScope.Descendants, containers))
                    {
                        if (!child.Current.IsOffscreen && child.Current.IsEnabled &&
                            child.Current.ProcessId == info.ProcessId && CastTitle(child.Current.Name))
                            result.Add(child);
                    }
                }
                catch (ElementNotAvailableException) { }
            }
            return result;
        }

        private static string ElementKey(AutomationElement element)
        {
            return String.Join(".", Array.ConvertAll(element.GetRuntimeId(), delegate(int value) { return value.ToString(); }));
        }

        private static AutomationElement DeviceControl(AutomationElement scope, string exactName)
        {
            Dictionary<string, AutomationElement> candidates = new Dictionary<string, AutomationElement>();
            string scopeKey = ElementKey(scope);
            bool unresolved = false;
            AutomationElementCollection labels = scope.FindAll(TreeScope.Descendants,
                new PropertyCondition(AutomationElement.NameProperty, exactName));
            foreach (AutomationElement label in labels)
            {
                if (!String.Equals(label.Current.Name, exactName, StringComparison.Ordinal) || label.Current.IsOffscreen) continue;
                AutomationElement current = label;
                bool found = false;
                for (int depth = 0; current != null && depth < 8; depth++)
                {
                    string key = ElementKey(current);
                    if (key == scopeKey) break;
                    ControlType type = current.Current.ControlType;
                    if (type == ControlType.Button || type == ControlType.ListItem || type == ControlType.DataItem)
                    {
                        object pattern;
                        if (current.Current.IsEnabled && !current.Current.IsOffscreen &&
                            (current.TryGetCurrentPattern(InvokePattern.Pattern, out pattern) ||
                             current.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern)))
                        { candidates[key] = current; found = true; }
                        // Nunca subir de uma entrada para um controle genérico que a contenha.
                        break;
                    }
                    current = TreeWalker.ControlViewWalker.GetParent(current);
                }
                if (!found) unresolved = true;
            }
            if (candidates.Count > 1 || (candidates.Count != 0 && unresolved))
                throw new InvalidOperationException("Há mais de uma correspondência ou uma entrada ambígua para a TV no painel de transmissão.");
            foreach (AutomationElement candidate in candidates.Values) return candidate;
            return null;
        }

        public static string Reconnect(string deviceName, string devicePath, string castName)
        {
            // A identidade persistida vem de Identify enquanto esse target estava ativo.
            // Uma consulta nova nunca é substituída pelo estado visual do flyout.
            string connected = ConnectedStatus(deviceName, devicePath);
            if (connected != null) return connected;
            string wifi = CheckWifi();
            if (wifi != null) return wifi;

            List<AutomationElement> scopes = CastScopes();
            if (scopes.Count > 1) return "O painel de transmissão está ambíguo. Nenhuma TV foi selecionada.";
            if (scopes.Count == 0) OpenCast();
            Stopwatch opening = Stopwatch.StartNew();
            while (scopes.Count == 0 && opening.ElapsedMilliseconds < 8000)
            {
                Thread.Sleep(250);
                scopes = CastScopes();
            }
            if (scopes.Count != 1)
                return "O painel Cast/Transmitir do Windows não ficou disponível de forma inequívoca. Nenhuma TV foi selecionada.";

            AutomationElement control = null;
            Stopwatch discovery = Stopwatch.StartNew();
            while (discovery.ElapsedMilliseconds < 7000)
            {
                scopes = CastScopes();
                if (scopes.Count != 1)
                    return "O painel de transmissão deixou de estar disponível de forma inequívoca. Nenhuma solicitação adicional foi feita.";
                control = DeviceControl(scopes[0], castName);
                if (control != null) break;
                Thread.Sleep(350);
            }
            if (control == null)
                return String.Format("A TV \"{0}\" não apareceu no painel Transmitir. Verifique se ela está ligada e confira o nome em Conexões no computador.", castName);

            // Uma única chamada ao padrão do controle. Falhas nunca provocam repetição.
            try
            {
                object pattern;
                if (control.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
                    ((InvokePattern)pattern).Invoke();
                else if (control.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern))
                    ((SelectionItemPattern)pattern).Select();
                else
                    return "A entrada da TV não oferece uma ação Invoke ou Select disponível.";
            }
            catch
            {
                return "Não foi possível concluir a ação da TV no painel do Windows. Verifique a TV; uma solicitação pode ter sido enviada, mas a conexão não foi confirmada.";
            }

            Stopwatch confirmation = Stopwatch.StartNew();
            while (confirmation.ElapsedMilliseconds < 12000)
            {
                Thread.Sleep(600);
                try
                {
                    connected = ConnectedStatus(deviceName, devicePath);
                    if (connected != null) return connected;
                }
                catch { /* Topologia transitória: consultar novamente, sem repetir a conexão. */ }
            }
            return String.Format("Solicitação de conexão enviada para \"{0}\". Aceite a confirmação na TV, se aparecer; a conexão ainda não foi confirmada pela topologia do Windows.", castName);
        }
    }
}
'@

    if ($Mode -eq 'Identify') {
        $identity = [Fbs.WindowsDisplay.Native]::Identify($X, $Y)
        $result = $null
        if ($null -ne $identity) {
            $result = [pscustomobject]@{
                kind = $identity.Kind
                deviceName = $identity.DeviceName
                devicePath = $identity.DevicePath
            }
        }
    }
    else {
        if ($Kind -cne 'wireless') {
            throw 'A reconexão exige a identidade de uma tela sem fio previamente ativa.'
        }
        $deviceName = Decode-Argument $DeviceNameBase64 256
        $devicePath = Decode-Argument $DevicePathBase64 4096
        $castName = $deviceName
        if (-not [string]::IsNullOrEmpty($CastNameBase64)) {
            $castName = Decode-Argument $CastNameBase64 256
        }
        $result = [pscustomobject]@{
            message = [Fbs.WindowsDisplay.Native]::Reconnect($deviceName, $devicePath, $castName)
        }
    }
}
catch {
    if ($Mode -eq 'Identify') {
        $result = $null
    }
    else {
        $detail = $_.Exception.GetBaseException().Message
        $result = [pscustomobject]@{
            message = "Não foi possível concluir a tentativa de conexão. $detail A conexão não foi confirmada."
        }
    }
}

$json = ConvertTo-Json -InputObject $result -Depth 4 -Compress
[Console]::Out.WriteLine($json)
