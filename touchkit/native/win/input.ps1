# TouchKit input helper for Windows. Same line commands as the macOS helper:
#   move DX DY | click left|right|double | down | up | scroll DX DY
#   key NAME | combo ctrl+shift+s | type TEXT | snap left|right|top|bottom|max|center | trusted
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TK {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public MOUSEINPUT mi; [FieldOffset(8)] public KEYBDINPUT ki; }
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  static void Send(INPUT i) { SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT))); }
  public static void Mouse(uint flags, int dx, int dy, int data) {
    var i = new INPUT { type = 0 }; i.mi.dx = dx; i.mi.dy = dy; i.mi.dwFlags = flags; i.mi.mouseData = (uint)data; Send(i);
  }
  public static void Key(ushort vk, bool up) {
    var i = new INPUT { type = 1 }; i.ki.wVk = vk; i.ki.dwFlags = up ? 2u : 0u; Send(i);
  }
  public static void Unicode(char c) {
    foreach (var up in new[] { false, true }) {
      var i = new INPUT { type = 1 }; i.ki.wScan = c; i.ki.dwFlags = 4u | (up ? 2u : 0u); Send(i);
    }
  }
}
'@
Add-Type -AssemblyName System.Windows.Forms

$vk = @{
  volup=0xAF; voldown=0xAE; mute=0xAD; play=0xB3; next=0xB0; prev=0xB1;
  enter=0x0D; tab=0x09; space=0x20; backspace=0x08; esc=0x1B; delete=0x2E;
  left=0x25; up=0x26; right=0x27; down=0x28; home=0x24; end=0x23; pageup=0x21; pagedown=0x22;
  ctrl=0x11; shift=0x10; alt=0x12; win=0x5B; cmd=0x11
}
function Press([int[]]$keys) {
  foreach ($k in $keys) { [TK]::Key($k, $false) }
  [array]::Reverse($keys); foreach ($k in $keys) { [TK]::Key($k, $true) }
}
function KeyCode($name) {
  if ($vk.ContainsKey($name)) { return $vk[$name] }
  if ($name.Length -eq 1) { return [int][char]$name.ToUpper() }
  return 0
}
function Combo($spec) { Press(@($spec.ToLower().Split('+') | ForEach-Object { KeyCode $_ })) }
function Brightness($delta) {
  $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1
  if ($m) {
    $v = [Math]::Max(0, [Math]::Min(100, $m.CurrentBrightness + $delta))
    Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{Timeout=1; Brightness=$v} | Out-Null
  }
}
function Key($name) {
  switch ($name) {
    'brightup' { Brightness 10 } 'brightdown' { Brightness -10 }
    'missioncontrol' { Combo 'win+tab' } 'launchpad' { Press @(0x5B) } 'desktop' { Combo 'win+d' }
    'search' { Combo 'win+s' } 'screenshot' { Combo 'win+shift+s' } 'lock' { Combo 'win+l' }
    'copy' { Combo 'ctrl+c' } 'paste' { Combo 'ctrl+v' } 'undo' { Combo 'ctrl+z' }
    'switchapp' { Combo 'alt+tab' } 'closewin' { Combo 'ctrl+w' }
    default { $c = KeyCode $name; if ($c) { Press @($c) } }
  }
}
function Snap($where) {
  $h = [TK]::GetForegroundWindow()
  $a = [System.Windows.Forms.Screen]::FromHandle($h).WorkingArea
  $x = $a.X; $y = $a.Y; $w = $a.Width; $hh = $a.Height
  switch ($where) {
    'left' { $w = [int]($w / 2) } 'right' { $w = [int]($w / 2); $x += $w }
    'top' { $hh = [int]($hh / 2) } 'bottom' { $hh = [int]($hh / 2); $y += $hh }
    'center' { $x += [int]($w * .15); $y += [int]($hh * .1); $w = [int]($w * .7); $hh = [int]($hh * .8) }
  }
  [TK]::ShowWindow($h, 9) | Out-Null
  [TK]::MoveWindow($h, $x, $y, $w, $hh, $true) | Out-Null
}

while ($null -ne ($line = [Console]::In.ReadLine())) {
  $p = $line.Split(' ', 3); $a = if ($p.Count -gt 1) { $p[1] } else { '' }; $b = if ($p.Count -gt 2) { $p[2] } else { '' }
  switch ($p[0]) {
    'move' { [TK]::Mouse(1, [int][double]$a, [int][double]$b, 0) }
    'click' {
      if ($a -eq 'right') { [TK]::Mouse(8, 0, 0, 0); [TK]::Mouse(16, 0, 0, 0) }
      else { $n = if ($a -eq 'double') { 2 } else { 1 }; for ($i = 0; $i -lt $n; $i++) { [TK]::Mouse(2, 0, 0, 0); [TK]::Mouse(4, 0, 0, 0) } }
    }
    'down' { [TK]::Mouse(2, 0, 0, 0) } 'up' { [TK]::Mouse(4, 0, 0, 0) }
    'scroll' { if ([int]$b) { [TK]::Mouse(0x800, 0, 0, [int][double]$b) }; if ([int]$a) { [TK]::Mouse(0x1000, 0, 0, -[int][double]$a) } }
    'key' { Key $a } 'combo' { Combo $a }
    'type' { foreach ($ch in $line.Substring(5).ToCharArray()) { [TK]::Unicode($ch) } }
    'snap' { Snap $a }
    'trusted' { [Console]::Out.WriteLine('trusted 1') }
  }
}
