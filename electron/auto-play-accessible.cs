using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Accessibility;

// Older CEF exposes its document through MSAA rather than the UI Automation bridge.
public static class OverworldAccessible {
  [DllImport("oleacc.dll")]
  static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint objectId, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IAccessible accessible);
  [DllImport("oleacc.dll")]
  static extern int AccessibleChildren(IAccessible parent, int start, int count, [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex=2)] object[] children, out int obtained);
  sealed class Target { public IAccessible Owner; public object Child; }
  sealed class Scan { public bool Profile; public bool Blocked; public bool Warning; public bool WarningOption; public int Visited; public int ProfileRole; public List<Target> Buttons = new List<Target>(); }
  static readonly Regex WarningOptionName = new Regex(@"(?:don't|do not).{0,20}(?:warn|show)|다시.{0,30}(?:표시|경고)", RegexOptions.IgnoreCase);
  static readonly Regex WarningName = new Regex(@"player safety features|installation.{0,40}modified|modified.{0,40}installation|설치.{0,30}수정|수정.{0,30}설치|플레이어.{0,20}안전", RegexOptions.IgnoreCase);
  static readonly Regex ProfileName = new Regex(@"^(?:(?:설치 설정 선택:|Select installation:|Installation selection:)\s*)?Overworld(?:\s|$)", RegexOptions.IgnoreCase);
  static readonly Regex PlayName = new Regex(@"^(PLAY|플레이|플레이하기|게임 시작)$", RegexOptions.IgnoreCase);
  static readonly Regex LoginName = new Regex(@"^(Sign in|Log in|Microsoft Login|로그인|Microsoft 로그인|Play Demo|Play trial|데모 플레이|체험판 플레이)$", RegexOptions.IgnoreCase);
  static void Walk(IAccessible accessible, object child, Scan scan, int depth) {
    if (depth > 40 || ++scan.Visited > 4000) return;
    try {
      string name = (accessible.get_accName(child) ?? "").Trim();
      int role = Convert.ToInt32(accessible.get_accRole(child));
      int state = Convert.ToInt32(accessible.get_accState(child));
      if ((state & (1 | 0x8000 | 0x10000)) == 0) {
        if (LoginName.IsMatch(name)) scan.Blocked = true;
        if (WarningName.IsMatch(name)) scan.Warning = true;
        if (role == 44 && WarningOptionName.IsMatch(name)) scan.WarningOption = true;
        if (ProfileName.IsMatch(name)) {
          scan.ProfileRole = role;
          if (role == 12 || role == 43 || role == 46 || role == 56 || role == 57 || role == 58) scan.Profile = true;
        }
        if (role == 43 && PlayName.IsMatch(name)) scan.Buttons.Add(new Target { Owner = accessible, Child = child });
      }
      if (Convert.ToInt32(child) != 0) return;
      int count = Math.Min(accessible.accChildCount, 1000);
      if (count <= 0) return;
      var children = new object[count]; int obtained;
      if (AccessibleChildren(accessible, 0, count, children, out obtained) < 0) return;
      for (int i = 0; i < obtained; i++) {
        var nested = children[i] as IAccessible;
        if (nested != null) Walk(nested, 0, scan, depth + 1);
        else if (children[i] is int) {
          object id = children[i];
          try { nested = accessible.get_accChild(id) as IAccessible; } catch { }
          if (nested != null) Walk(nested, 0, scan, depth + 1);
          else Walk(accessible, id, scan, depth + 1);
        }
      }
    } catch { }
  }
  public static string Play(IntPtr window, bool afterPlay) {
    try {
      Guid iid = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71"); IAccessible root;
      if (AccessibleObjectFromWindow(window, unchecked((uint)-4), ref iid, out root) < 0 || root == null) return "missing";
      var scan = new Scan(); Walk(root, 0, scan, 0);
      if (scan.Blocked) return "login";
      if ((!afterPlay && scan.Profile || afterPlay && scan.Warning && scan.WarningOption) && scan.Buttons.Count == 1) {
        var button = scan.Buttons[0];
        if (String.IsNullOrEmpty(button.Owner.get_accDefaultAction(button.Child))) return "unsupported";
        button.Owner.accDoDefaultAction(button.Child);
        return afterPlay ? "warning-invoked" : "invoked";
      }
      return "msaa:profile=" + scan.Profile + ":role=" + scan.ProfileRole + ":buttons=" + scan.Buttons.Count + ":nodes=" + scan.Visited;
    } catch { return "unavailable"; }
  }
}
