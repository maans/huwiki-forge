#!/usr/bin/env swift
// Smoke test for the regular Finder-launched ForgeShare UI on a macOS CI host.
// A running PID or a passing --self-test is NOT proof that the library window opened.
import Foundation
import CoreGraphics

guard CommandLine.arguments.count == 2,
      let rawPID = Int32(CommandLine.arguments[1]), rawPID > 0 else {
    fputs("Usage: forgeshare-mac-window-smoke.swift <PID>\n", stderr)
    exit(2)
}
let targetPID = rawPID
for _ in 0..<25 {
    if let windows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID)
          as? [[String:Any]] {
        for info in windows {
            guard let owner = info[kCGWindowOwnerPID as String] as? NSNumber,
                  owner.int32Value == targetPID,
                  let layer = info[kCGWindowLayer as String] as? NSNumber,
                  layer.intValue == 0,
                  let bounds = info[kCGWindowBounds as String] as? [String:Any],
                  let width = bounds["Width"] as? NSNumber,
                  let height = bounds["Height"] as? NSNumber else { continue }
            if width.doubleValue >= 850 && height.doubleValue >= 550 {
                print("ForgeShare normal UI window found for PID \(targetPID)")
                exit(0)
            }
        }
    }
    Thread.sleep(forTimeInterval: 0.35)
}
fputs("ForgeShare ran without a visible 900x600 library window.\n", stderr)
exit(1)
