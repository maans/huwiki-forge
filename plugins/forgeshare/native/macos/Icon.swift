import AppKit
let directory = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath:directory,withIntermediateDirectories:true)
func draw(_ size:Int, _ name:String) {
    let image=NSImage(size:NSSize(width:size,height:size)); image.lockFocus()
    let context=NSGraphicsContext.current!.cgContext; context.scaleBy(x:CGFloat(size)/512,y:CGFloat(size)/512)
    NSColor(calibratedRed:0.12,green:0.28,blue:0.63,alpha:1).setFill()
    NSBezierPath(roundedRect:NSRect(x:20,y:20,width:472,height:472),xRadius:102,yRadius:102).fill()
    NSColor.white.setFill(); NSBezierPath(roundedRect:NSRect(x:124,y:110,width:222,height:294),xRadius:18,yRadius:18).fill()
    NSColor(calibratedRed:0.8,green:0.88,blue:1,alpha:1).setFill(); NSBezierPath(rect:NSRect(x:144,y:130,width:20,height:254)).fill()
    NSColor(calibratedRed:0.12,green:0.28,blue:0.63,alpha:1).setFill()
    for y in [320,272,224] { NSBezierPath(roundedRect:NSRect(x:190,y:y,width:112,height:12),xRadius:6,yRadius:6).fill() }
    NSColor(calibratedRed:0.2,green:0.8,blue:0.62,alpha:1).setFill()
    for (x,y) in [(348,132),(400,190),(348,248)] { NSBezierPath(ovalIn:NSRect(x:x-20,y:y-20,width:40,height:40)).fill() }
    let link=NSBezierPath();link.move(to:NSPoint(x:348,y:132));link.line(to:NSPoint(x:400,y:190));link.line(to:NSPoint(x:348,y:248));link.lineWidth=12;link.stroke()
    image.unlockFocus()
    let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
    try! rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:directory).appendingPathComponent(name))
}
for size in [16,32,128,256,512] { draw(size,"icon_\(size)x\(size).png");draw(size*2,"icon_\(size)x\(size)@2x.png") }
