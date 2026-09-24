$ErrorActionPreference = 'Stop'
$command = [Console]::In.ReadToEnd() | ConvertFrom-Json

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class ThiriInput {
    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extraInfo);
    [DllImport("user32.dll")]
    private static extern uint SendInput(uint count, INPUT[] inputs, int size);

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT { public uint type; public InputUnion data; }
    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion {
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public MOUSEINPUT mouse;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT { public int x; public int y; public uint data; public uint flags; public uint time; public UIntPtr extraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT { public ushort virtualKey; public ushort scan; public uint flags; public uint time; public UIntPtr extraInfo; }

    public static void Move(int x, int y) {
        if (!SetCursorPos(x, y)) throw new Exception("Could not move the cursor.");
    }

    public static void Click(int x, int y, string button) {
        Move(x, y);
        uint down = button == "right" ? 0x0008u : 0x0002u;
        uint up = button == "right" ? 0x0010u : 0x0004u;
        mouse_event(down, 0, 0, 0, UIntPtr.Zero);
        mouse_event(up, 0, 0, 0, UIntPtr.Zero);
    }

    public static void Scroll(int steps) {
        mouse_event(0x0800u, 0, 0, steps * 120, UIntPtr.Zero);
    }

    public static void Type(string text) {
        foreach (char character in text) {
            var down = new INPUT { type = 1, data = new InputUnion { keyboard = new KEYBDINPUT { scan = character, flags = 0x0004 } } };
            var up = new INPUT { type = 1, data = new InputUnion { keyboard = new KEYBDINPUT { scan = character, flags = 0x0004 | 0x0002 } } };
            if (SendInput(2, new[] { down, up }, Marshal.SizeOf(typeof(INPUT))) != 2) throw new Exception("Could not type text.");
        }
    }

    private static byte KeyCode(string key) {
        key = key.ToUpperInvariant();
        if (key.Length == 1 && key[0] >= 'A' && key[0] <= 'Z') return (byte)key[0];
        if (key.Length == 1 && key[0] >= '0' && key[0] <= '9') return (byte)key[0];
        var keys = new Dictionary<string, byte> {
            {"CTRL", 0x11}, {"CONTROL", 0x11}, {"ALT", 0x12}, {"SHIFT", 0x10}, {"WIN", 0x5B},
            {"ENTER", 0x0D}, {"RETURN", 0x0D}, {"TAB", 0x09}, {"ESC", 0x1B}, {"ESCAPE", 0x1B},
            {"BACKSPACE", 0x08}, {"DELETE", 0x2E}, {"SPACE", 0x20}, {"UP", 0x26}, {"DOWN", 0x28},
            {"LEFT", 0x25}, {"RIGHT", 0x27}, {"HOME", 0x24}, {"END", 0x23}, {"PAGEUP", 0x21}, {"PAGEDOWN", 0x22}
        };
        if (keys.ContainsKey(key)) return keys[key];
        int number;
        if (key.StartsWith("F") && int.TryParse(key.Substring(1), out number) && number >= 1 && number <= 12) return (byte)(0x70 + number - 1);
        throw new Exception("Unsupported key: " + key);
    }

    public static void Press(string shortcut) {
        string[] parts = shortcut.Split('+');
        var codes = new List<byte>();
        foreach (string part in parts) codes.Add(KeyCode(part.Trim()));
        foreach (byte code in codes) keybd_event(code, 0, 0, UIntPtr.Zero);
        for (int index = codes.Count - 1; index >= 0; index--) keybd_event(codes[index], 0, 0x0002, UIntPtr.Zero);
    }
}
'@

switch ($command.action) {
    'move' { [ThiriInput]::Move([int]$command.x, [int]$command.y) }
    'click' { [ThiriInput]::Click([int]$command.x, [int]$command.y, [string]$command.button) }
    'scroll' { [ThiriInput]::Scroll([int]$command.steps) }
    'type' { [ThiriInput]::Type([string]$command.text) }
    'keys' { [ThiriInput]::Press([string]$command.keys) }
    default { throw 'Unsupported input action.' }
}
