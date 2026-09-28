#!/usr/bin/env python3
"""Generates compositions/frames/NN-*.html for the Kickoff promo.

Each frame is a HyperFrames sub-composition: one bare <template> fragment with
its own <style>/<script>, a full-bleed background clip, and one paused GSAP
timeline registered at window.__timelines[<frame_id>]. Shared look (fonts,
glass, grain, scanlines, vignette) comes from common() so all seven frames read
as one system. Randomness is seeded (mulberry32) so every render is identical.

Run from the project root:  python3 tools/build_frames.py
"""
import os

GSAP = '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>'

FONTS = """
@font-face{font-family:"Clash Display";src:url("assets/fonts/ClashDisplay-500.woff2") format("woff2");font-weight:500}
@font-face{font-family:"Clash Display";src:url("assets/fonts/ClashDisplay-600.woff2") format("woff2");font-weight:600}
@font-face{font-family:"Clash Display";src:url("assets/fonts/ClashDisplay-700.woff2") format("woff2");font-weight:700}
@font-face{font-family:"Inter";src:url("assets/fonts/Inter-400.woff2") format("woff2");font-weight:400}
@font-face{font-family:"Inter";src:url("assets/fonts/Inter-600.woff2") format("woff2");font-weight:600}
@font-face{font-family:"JetBrains Mono";src:url("assets/fonts/JetBrainsMono-500.woff2") format("woff2");font-weight:500}
"""

GRAIN_SVG = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>"
             "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>"
             "<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/></filter>"
             "<rect width='300' height='300' filter='url(%23n)'/></svg>")

COMMON_CSS = """
#root{position:absolute;inset:0;overflow:hidden;color:#F5F4FF;font-family:"Inter",sans-serif}
.§bg{position:absolute;inset:0;background:#05060A;overflow:hidden}
.§nebula{position:absolute;inset:-10%;background:
  radial-gradient(45% 40% at 50% 58%,rgba(78,60,181,.42),transparent 70%),
  radial-gradient(30% 28% at 18% 22%,rgba(123,98,246,.18),transparent 70%),
  radial-gradient(28% 26% at 84% 78%,rgba(0,200,5,.08),transparent 70%)}
.§stage{position:absolute;inset:0}
.§fx{position:absolute;inset:0;pointer-events:none}
.§grain{position:absolute;left:-300px;top:-300px;width:2520px;height:1680px;opacity:.06;background-image:url("GRAIN");mix-blend-mode:overlay}
.§scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px);opacity:.5}
.§vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.78) 100%)}
.§glass{position:absolute;background:linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.03));
  backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%);
  border:1px solid rgba(255,255,255,.18);border-radius:28px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.34),inset 0 0 40px rgba(123,98,246,.10),0 30px 80px rgba(0,0,0,.55)}
.§label{font-family:"Inter",sans-serif;font-weight:600;font-size:16px;letter-spacing:.28em;text-transform:uppercase;color:#A6A3C2}
.§mono{font-family:"JetBrains Mono",monospace;font-weight:500}
.§display{font-family:"Clash Display",sans-serif;font-weight:600;letter-spacing:-.03em;line-height:.95}
.§dot{position:absolute;border-radius:50%;background:#fff}
""".replace("GRAIN", GRAIN_SVG)

COMMON_JS = """
const ID = "§ID";
const D = §DUR;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rng = mulberry32(§SEED);
const R = (a,b)=>a+(b-a)*rng();
const $ = (s)=>document.querySelector('#root[data-composition-id="'+ID+'"] '+s) || document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const tl = gsap.timeline({ paused: true });
// film grain: jump the noise plate every 80ms (seeded, seek-safe)
(function(){const g=$(".§grain");for(let t=0;t<D;t+=0.08){tl.set(g,{x:Math.round(R(-280,280)),y:Math.round(R(-280,280))},t);}})();
// drifting particles
function particles(container, n, opts){
  opts = opts || {};
  const host = $(container);
  for(let i=0;i<n;i++){
    const d = document.createElement("div");
    d.className = "§dot";
    const s = R(1.2, opts.big||3.6);
    d.style.width = s+"px"; d.style.height = s+"px";
    d.style.left = R(0,1920)+"px"; d.style.top = R(0,1080)+"px";
    const c = rng()<0.55 ? "#7B62F6" : (rng()<0.5 ? "#00C805" : "#ffffff");
    d.style.background = c; d.style.boxShadow = "0 0 "+(s*4)+"px "+c;
    host.appendChild(d);
    const a = R(0.25,0.9);
    tl.fromTo(d,{opacity:0,y:0,x:0},{opacity:a,duration:R(0.4,1.2),ease:"sine.out"},R(0,0.8));
    tl.to(d,{y:-R(opts.rise||40,(opts.rise||40)*3),x:R(-30,30),duration:D,ease:"none"},0);
  }
}
"""


def common_head(fid):
    return (FONTS + COMMON_CSS)


def frame(fid, dur, seed, css, body, js, bg_extra=""):
    p = fid.split("-")[0]  # "01"
    pre = "f" + p + "-"
    html = f"""<template>
{GSAP}
<style>
{common_head(fid)}
{css}
</style>
<div id="root" data-composition-id="{fid}" data-width="1920" data-height="1080" data-duration="{dur}">
  <div class="§bg clip" id="§bgclip" data-start="0" data-duration="{dur}" data-track-index="0">
    <div class="§nebula" id="§nebula"></div>{bg_extra}
    <div class="§stage" id="§particles"></div>
  </div>
  <div class="§stage" id="§stage">
{body}
  </div>
  <div class="§fx" data-layout-allow-occlusion><div class="§grain" data-layout-allow-occlusion></div><div class="§scan" data-layout-allow-occlusion></div><div class="§vig" data-layout-allow-occlusion></div></div>
</div>
<script>
(function(){{
{COMMON_JS.replace("§ID", fid).replace("§DUR", str(dur)).replace("§SEED", str(seed))}
{js}
window.__timelines["{fid}"] = tl;
}})();
</script>
</template>
"""
    return html.replace("§", pre)


FRAMES = {}

# ─────────────────────────── Frame 1 — Signal (5s) ───────────────────────────
def pitch_svg(pre, cls, stroke="#7B62F6"):
    lines = []
    grid = []
    for x in range(0, 1051, 75):
        grid.append(f'<line x1="{x}" y1="0" x2="{x}" y2="680"/>')
    for y in range(0, 681, 68):
        grid.append(f'<line x1="0" y1="{y}" x2="1050" y2="{y}"/>')
    paths = [
        '<rect x="0" y="0" width="1050" height="680"/>',
        '<line x1="525" y1="0" x2="525" y2="680"/>',
        '<circle cx="525" cy="340" r="91.5"/>',
        '<rect x="0" y="138.4" width="165" height="403.2"/>',
        '<rect x="885" y="138.4" width="165" height="403.2"/>',
        '<rect x="0" y="248.4" width="55" height="183.2"/>',
        '<rect x="995" y="248.4" width="55" height="183.2"/>',
        '<path d="M165 267 A91.5 91.5 0 0 1 165 413"/>',
        '<path d="M885 267 A91.5 91.5 0 0 0 885 413"/>',
    ]
    p = "".join(s.replace("/>", f' class="{pre}{cls}" pathLength="1"/>') for s in paths)
    return (f'<svg viewBox="-20 -20 1090 720" width="100%" height="100%" fill="none" stroke="{stroke}" stroke-width="3">'
            f'<g class="{pre}mesh" stroke-width="1" opacity=".22">{"".join(grid)}</g>{p}'
            f'<circle cx="525" cy="340" r="5" fill="{stroke}" class="{pre}spot"/></svg>')

FRAMES["01-signal"] = dict(dur=5, seed=11, css="""
.§cam{position:absolute;inset:0;perspective:1300px}
.§plane{position:absolute;left:260px;top:250px;width:1400px;height:900px;filter:drop-shadow(0 0 10px rgba(123,98,246,.9)) drop-shadow(0 0 30px rgba(123,98,246,.5))}
.§line{stroke-dasharray:1;stroke-dashoffset:1}
.§sweep{position:absolute;left:0;top:0;width:1920px;height:3px;background:linear-gradient(90deg,transparent,#b9a9ff 30%,#fff 50%,#b9a9ff 70%,transparent);box-shadow:0 0 24px 6px rgba(123,98,246,.8)}
.§sweeptrail{position:absolute;left:0;top:-220px;width:1920px;height:220px;background:linear-gradient(0deg,rgba(123,98,246,.28),transparent)}
.§hud{position:absolute;top:64px;font-size:15px}
.§q{position:absolute;left:0;right:0;top:170px;text-align:center;font-size:400px;font-weight:700;
  background:linear-gradient(180deg,#ffffff 10%,#b9a9ff 55%,#7B62F6 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 30px rgba(123,98,246,.9)) drop-shadow(0 0 90px rgba(123,98,246,.6))}
.§qr,.§qc{position:absolute;left:0;right:0;top:170px;text-align:center;font-size:400px;font-weight:700;mix-blend-mode:screen;opacity:0}
.§qr{color:#ff2d55}.§qc{color:#22d3ee}
.§livedot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#00C805;box-shadow:0 0 12px #00C805;margin-right:10px;vertical-align:middle}
""", body=f"""
    <div class="§cam"><div class="§plane" id="§plane">{pitch_svg('§', 'line')}</div></div>
    <div class="§sweep" id="§sweep"><div class="§sweeptrail"></div></div>
    <div class="§hud §label §mono" style="left:80px">KICKOFF // SIGNAL ACQUIRED</div>
    <div class="§hud §label §mono" style="right:80px"><span class="§livedot" id="§live"></span>LIVE FEED · MATCHDAY</div>
    <div class="§qr §display" id="§qr" data-layout-allow-overlap>?</div><div class="§qc §display" id="§qc" data-layout-allow-overlap>?</div>
    <div class="§q §display" id="§q">?</div>
""", js="""
particles("#§particles", 110, {rise:30});
gsap.set("#§plane",{rotationX:66,transformOrigin:"50% 50%"});
tl.fromTo("#§nebula",{opacity:0},{opacity:1,duration:2.2,ease:"sine.inOut"},0);
tl.fromTo("#§plane",{scale:.78,rotationZ:-10,y:120},{scale:1.02,rotationZ:3,y:40,duration:D,ease:"sine.inOut"},0);
tl.fromTo("#§plane .§mesh",{opacity:0},{opacity:.22,duration:1.6},0.3);
tl.fromTo("#§plane .§line",{strokeDashoffset:1},{strokeDashoffset:0,duration:1.6,stagger:0.14,ease:"power2.inOut"},0.35);
tl.fromTo("#§plane .§spot",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.4,ease:"back.out(3)"},1.6);
tl.fromTo("#§sweep",{y:120,opacity:0},{y:1000,opacity:1,duration:2.3,ease:"power1.inOut"},0.15);
tl.to("#§sweep",{opacity:0,duration:.4},2.45);
tl.fromTo(".§hud",{opacity:0,y:-10},{opacity:1,y:0,duration:.6,stagger:.15},0.5);
tl.fromTo("#§live",{opacity:1},{opacity:.15,duration:.35,repeat:6,yoyo:true,ease:"steps(1)"},0.6);
// the question mark lands on "question" (~3.1s)
tl.fromTo("#§q",{opacity:0,scale:1.5,filter:"blur(30px) drop-shadow(0 0 30px rgba(123,98,246,.9))"},
  {opacity:1,scale:1,filter:"blur(0px) drop-shadow(0 0 30px rgba(123,98,246,.9))",duration:.7,ease:"expo.out"},3.0);
[3.02,3.12,3.55,4.3].forEach((t,i)=>{
  tl.set("#§qr",{opacity:.85,x:-14-i*2},t); tl.set("#§qc",{opacity:.85,x:14+i*2},t);
  tl.set("#§qr",{opacity:0,x:0},t+.07); tl.set("#§qc",{opacity:0,x:0},t+.07);
});
tl.to("#§q",{scale:1.06,duration:1.3,ease:"sine.inOut"},3.7);
""")

# ─────────────────────────── Frame 2 — Boot-up (6s) ──────────────────────────
def stadium_svg(pre):
    rings = []
    for i, (rx, ry) in enumerate([(930, 300), (820, 262), (700, 222), (580, 184)]):
        rings.append(f'<ellipse class="{pre}ring" cx="960" cy="650" rx="{rx}" ry="{ry}" pathLength="1" opacity="{.9 - i*.15:.2f}"/>')
    import math
    ticks = []
    for k in range(72):
        a = 2 * math.pi * k / 72
        x1, y1 = 960 + 930 * math.cos(a), 650 + 300 * math.sin(a)
        x2, y2 = 960 + 700 * math.cos(a), 650 + 222 * math.sin(a)
        ticks.append(f'<line class="{pre}tick" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
    pitch = f'<rect class="{pre}ring" x="660" y="560" width="600" height="180" pathLength="1" opacity=".7"/>'
    return (f'<svg viewBox="0 0 1920 1080" width="1920" height="1080" fill="none" stroke="#7B62F6" stroke-width="2">'
            f'{"".join(rings)}<g stroke-width="1" opacity=".35">{"".join(ticks)}</g>{pitch}</svg>')

boot_lines = [("PITCH MESH", "ONLINE", "ok"), ("CROWD FEED", "ONLINE", "ok"), ("FLOODLIGHTS", "ONLINE", "ok"),
              ("MARKET TYPE", "BINARY", "bad"), ("OUTCOMES", "2", "bad"), ("PRECISION", "NONE", "bad")]
boot_html = "".join(
    f'<div class="§bl"><span>{k}</span><span class="§dots"></span><span class="§{c}">{v}</span></div>' for k, v, c in boot_lines)
bars_html = "".join('<div class="§bar"></div>' for _ in range(22))

FRAMES["02-bootup"] = dict(dur=6, seed=22, css="""
.§stad{position:absolute;inset:0;filter:drop-shadow(0 0 8px rgba(123,98,246,.8))}
.§ring{stroke-dasharray:1;stroke-dashoffset:1}
.§flare{position:absolute;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.95) 0,rgba(185,169,255,.55) 12%,rgba(123,98,246,.18) 35%,transparent 65%);mix-blend-mode:screen}
.§panel{width:440px;padding:30px 30px 24px}
.§ptitle{margin-bottom:18px;color:#F5F4FF}
.§bl{display:flex;gap:10px;font-family:"JetBrains Mono",monospace;font-size:17px;color:#A6A3C2;margin:10px 0}
.§dots{flex:1;border-bottom:2px dotted rgba(255,255,255,.18);transform:translateY(-6px)}
.§ok{color:#00C805;text-shadow:0 0 10px rgba(0,200,5,.7)}
.§bad{color:#ff4d6d;text-shadow:0 0 10px rgba(255,77,109,.6)}
.§bars{display:flex;align-items:flex-end;gap:7px;height:150px;margin-top:8px}
.§bar{flex:1;height:100%;background:linear-gradient(0deg,#7B62F6,#b9a9ff);border-radius:3px;transform-origin:50% 100%;box-shadow:0 0 10px rgba(123,98,246,.6)}
.§board{left:560px;top:300px;width:800px;height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.§teams{display:flex;gap:340px;margin-bottom:6px}
.§score{position:relative;font-size:190px;color:#fff;text-shadow:0 0 30px rgba(123,98,246,.9),0 0 80px rgba(123,98,246,.5)}
.§sr,.§sc{position:absolute;left:0;top:0;width:100%;text-align:center;mix-blend-mode:screen;opacity:0;text-shadow:none}
.§sr{color:#ff2d55}.§sc{color:#22d3ee}
.§pill{top:650px;width:220px;height:84px;display:flex;align-items:center;justify-content:center;font-size:44px;border-radius:42px}
#§yes{left:710px;color:#00C805;text-shadow:0 0 18px rgba(0,200,5,.8)}
#§no{left:990px;color:#ff4d6d;text-shadow:0 0 18px rgba(255,77,109,.8)}
.§strike{position:absolute;left:680px;top:690px;width:560px;height:4px;background:#fff;box-shadow:0 0 16px #fff;transform-origin:0 50%}
.§bin{position:absolute;left:0;right:0;top:770px;text-align:center}
.§slice{position:absolute;left:560px;width:800px;height:34px;background:rgba(123,98,246,.35);mix-blend-mode:screen;opacity:0}
""", body=f"""
    <div class="§stad" id="§stad">{stadium_svg('§')}</div>
    <div class="§flare" id="§fl1" style="left:-160px;top:-230px"></div>
    <div class="§flare" id="§fl2" style="left:420px;top:-300px"></div>
    <div class="§flare" id="§fl3" style="left:980px;top:-300px"></div>
    <div class="§flare" id="§fl4" style="left:1560px;top:-230px"></div>
    <div class="§glass §panel" id="§left" style="left:80px;top:200px">
      <div class="§label §ptitle">System boot</div>{boot_html}
    </div>
    <div class="§glass §panel" id="§right" style="left:1400px;top:200px">
      <div class="§label §ptitle">Signal</div><div class="§bars">{bars_html}</div>
      <div class="§bl" style="margin-top:18px"><span>LATENCY</span><span class="§dots"></span><span class="§ok">12ms</span></div>
    </div>
    <div class="§glass §board" id="§board">
      <div class="§teams §label"><span>Home</span><span>Away</span></div>
      <div class="§score §display" id="§score">? – ?<div class="§sr" id="§sr" data-layout-allow-overlap>? – ?</div><div class="§sc" id="§sc" data-layout-allow-overlap>? – ?</div></div>
    </div>
    <div class="§slice" id="§sl1" style="top:360px"></div><div class="§slice" id="§sl2" style="top:470px"></div>
    <div class="§glass §pill §display" id="§yes" style="position:absolute">YES</div>
    <div class="§glass §pill §display" id="§no" style="position:absolute">NO</div>
    <div class="§strike" id="§strike"></div>
    <div class="§bin §label" id="§bin">Binary markets · 2 outcomes · 0 nuance</div>
""", js="""
particles("#§particles", 60, {rise:20});
tl.fromTo("#§nebula",{opacity:.4},{opacity:1,duration:2},0);
tl.fromTo("#§stad",{scale:1.25,y:80,opacity:0},{scale:1,y:0,opacity:1,duration:2.2,ease:"expo.out"},0);
tl.to("#§stad",{scale:1.06,duration:3.8,ease:"sine.inOut"},2.2);
tl.fromTo("#§stad .§ring",{strokeDashoffset:1},{strokeDashoffset:0,duration:1.4,stagger:.12,ease:"power2.out"},0.1);
tl.fromTo("#§stad .§tick",{opacity:0},{opacity:1,duration:.02,stagger:.012},0.5);
// floodlights flicker on, one after another
["#§fl1","#§fl2","#§fl3","#§fl4"].forEach((f,i)=>{
  const t = 0.35+i*.16;
  tl.fromTo(f,{opacity:0,scale:.6},{opacity:1,scale:1,duration:.06},t);
  tl.to(f,{opacity:.25,duration:.05},t+.08); tl.to(f,{opacity:1,duration:.05},t+.15);
  tl.to(f,{opacity:.75,duration:2,ease:"sine.inOut"},t+.4);
});
// glass HUD panels unfold
tl.fromTo("#§left",{x:-120,opacity:0,clipPath:"inset(0 0 100% 0 round 28px)"},{x:0,opacity:1,clipPath:"inset(0 0 0% 0 round 28px)",duration:.9,ease:"expo.out"},0.6);
tl.fromTo("#§right",{x:120,opacity:0,clipPath:"inset(0 0 100% 0 round 28px)"},{x:0,opacity:1,clipPath:"inset(0 0 0% 0 round 28px)",duration:.9,ease:"expo.out"},0.75);
tl.fromTo("#§left .§bl",{opacity:0,x:-14},{opacity:1,x:0,duration:.2,stagger:.3},1.0);
$$("#§right .§bar").forEach((b,i)=>{
  tl.fromTo(b,{scaleY:.05},{scaleY:R(.2,1),duration:.25,ease:"power2.out"},1.0+i*.02);
  for(let t=1.4;t<D;t+=0.25){ tl.to(b,{scaleY:R(.12,1),duration:.22,ease:"sine.inOut"},t); }
});
// scoreboard boots
tl.fromTo("#§board",{scaleY:0,opacity:0},{scaleY:1,opacity:1,duration:.55,ease:"expo.out"},0.9);
tl.fromTo("#§score",{opacity:0,scaleX:1.35,filter:"blur(10px)"},{opacity:1,scaleX:1,filter:"blur(0px)",duration:.7,ease:"expo.out"},1.1);
[1.25,1.32,2.1,2.9,3.95,4.7,4.78,5.3].forEach((t,i)=>{
  const k=(i%3)+1;
  tl.set("#§sr",{opacity:.9,x:-10*k},t); tl.set("#§sc",{opacity:.9,x:10*k},t);
  tl.set("#§board",{skewX:(i%2?4:-4)},t);
  tl.set("#§sl"+(i%2+1),{opacity:1,x:(i%2?30:-30)},t);
  tl.set("#§sr",{opacity:0,x:0},t+.06); tl.set("#§sc",{opacity:0,x:0},t+.06);
  tl.set("#§board",{skewX:0},t+.06); tl.set("#§sl"+(i%2+1),{opacity:0,x:0},t+.06);
});
// the only two answers: YES (~3.0) / NO (~3.9)
tl.fromTo("#§yes",{opacity:0,y:30,scale:.8},{opacity:1,y:0,scale:1,duration:.5,ease:"back.out(2)"},2.95);
tl.fromTo("#§no",{opacity:0,y:30,scale:.8},{opacity:1,y:0,scale:1,duration:.5,ease:"back.out(2)"},3.85);
tl.fromTo("#§strike",{scaleX:0},{scaleX:1,duration:.45,ease:"power3.inOut"},4.7);
tl.fromTo("#§bin",{opacity:0,y:10},{opacity:1,y:0,duration:.4},4.8);
tl.to(["#§yes","#§no"],{opacity:.35,filter:"saturate(0)",duration:.5},5.0);
""")

# ─────────────────────────── Frame 3 — The shift (8s) ────────────────────────
tiles = []
for h in range(5):
    for a in range(5):
        tiles.append(f'<div class="§tile §display" id="§t{h}{a}" data-h="{h}" data-a="{a}">{h}–{a}</div>')
shards3 = "".join(f'<div class="§shard" id="§sh{i}"></div>' for i in range(22))

FRAMES["03-shift"] = dict(dur=8, seed=33, css="""
.§cam{position:absolute;inset:0;perspective:1700px}
.§plane{position:absolute;left:560px;top:190px;width:800px;height:640px}
.§grid{position:absolute;left:70px;top:60px;display:grid;grid-template-columns:repeat(5,130px);grid-auto-rows:100px;gap:16px}
.§tile{position:relative;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:40px;color:#F5F4FF;
  background:linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.18);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 20px 40px rgba(0,0,0,.45)}
.§axisx{position:absolute;left:70px;top:18px;width:714px;text-align:center}
.§axisy{position:absolute;left:-150px;top:340px;width:300px;text-align:center;transform:rotate(-90deg)}
.§sel{position:absolute;left:0;top:0;width:146px;height:116px;border:3px solid #b9a9ff;border-radius:24px;box-shadow:0 0 24px rgba(123,98,246,.9),inset 0 0 24px rgba(123,98,246,.6)}
.§tag{position:absolute;padding:10px 18px;border-radius:999px;font-size:15px;white-space:nowrap}
.§ripple{position:absolute;width:40px;height:40px;border-radius:50%;border:3px solid #00C805;box-shadow:0 0 30px #00C805}
.§kicker{position:absolute;left:0;right:0;top:78px;text-align:center;font-size:18px;color:#b9a9ff}
.§legend{position:absolute;left:1450px;top:760px;width:360px}
.§lbar{height:10px;border-radius:5px;background:linear-gradient(90deg,#7B62F6,#00C805 35%,rgba(0,200,5,.25) 70%,rgba(255,255,255,.08));box-shadow:0 0 16px rgba(0,200,5,.4);transform-origin:0 50%}
.§lrow{display:flex;justify-content:space-between;margin-top:10px;font-size:13px}
.§shard{position:absolute;left:910px;top:500px;width:100px;height:100px;background:linear-gradient(135deg,rgba(255,255,255,.35),rgba(185,169,255,.08));border:1px solid rgba(255,255,255,.4)}
""", body=f"""
    <div class="§kicker §label" id="§kick">Proximity markets</div>
    <div class="§cam"><div class="§plane" id="§plane">
      <div class="§axisx §label" id="§ax">Away goals →</div>
      <div class="§axisy §label" id="§ay">← Home goals</div>
      <div class="§grid" id="§grid">{''.join(tiles)}</div>
      <div class="§sel" id="§sel"></div>
      <div class="§ripple" id="§rip1"></div><div class="§ripple" id="§rip2"></div>
      <div class="§glass §tag §label" id="§your" style="color:#fff;background:rgba(123,98,246,.55);border-color:rgba(185,169,255,.7)">Your call</div>
      <div class="§glass §tag §mono" id="§stake" style="font-size:18px;color:#fff">STAKE · 25 USDC</div>
    </div></div>
    {shards3}
    <div class="§legend" id="§legend"><div class="§label" style="color:#F5F4FF;margin-bottom:12px">Proximity field</div>
      <div class="§lbar" id="§lbar"></div>
      <div class="§lrow §label"><span>Exact</span><span>Close</span><span>Far</span></div></div>
""", js="""
particles("#§particles", 70, {rise:30});
// scoreboard shatters: glass shards burst outward
$$(".§shard").forEach((s,i)=>{
  const a = (i/22)*Math.PI*2 + R(-.2,.2), dist = R(500,1100);
  const pts = [[R(0,50),0],[100,R(20,80)],[R(10,90),100]].map(p=>p[0]+"% "+p[1]+"%").join(",");
  s.style.clipPath = "polygon("+pts+")";
  tl.fromTo(s,{x:0,y:0,rotation:0,scale:R(.8,2.2),opacity:1},
    {x:Math.cos(a)*dist,y:Math.sin(a)*dist*.6,rotation:R(-360,360),scale:R(.3,1),opacity:0,duration:R(.7,1.1),ease:"expo.out"},0);
});
gsap.set("#§plane",{rotationX:28,transformOrigin:"50% 60%"});
tl.fromTo("#§plane",{rotationY:-14,scale:.92},{rotationY:10,scale:1.04,duration:D,ease:"sine.inOut"},0);
tl.fromTo("#§kick",{opacity:0,scaleX:1.4},{opacity:1,scaleX:1,duration:1,ease:"expo.out"},0.4);
tl.fromTo(["#§ax","#§ay"],{opacity:0},{opacity:1,duration:.6},1.2);
// tiles fly in from depth, centre-out
const tilesEls = $$(".§tile");
tilesEls.forEach(t=>{
  const h=+t.dataset.h, a=+t.dataset.a, d=Math.abs(h-2)+Math.abs(a-2);
  tl.fromTo(t,{opacity:0,z:-500,y:40},{opacity:1,z:0,y:0,duration:.8,ease:"expo.out"},0.45+d*.13);
});
// selector hunts, then locks on 2–1 ("Call the exact score" ~2.4s)
const cell=(h,a)=>({x:70+a*146-8,y:60+h*116-8});
const p0=cell(0,4), p1=cell(3,3), p2=cell(2,1);
tl.fromTo("#§sel",{opacity:0,x:p0.x,y:p0.y},{opacity:1,duration:.2},2.0);
tl.to("#§sel",{x:p1.x,y:p1.y,duration:.3,ease:"power3.inOut"},2.2);
tl.to("#§sel",{x:p2.x,y:p2.y,duration:.35,ease:"power3.inOut"},2.55);
tl.to("#§t21",{backgroundColor:"rgba(123,98,246,.85)",scale:1.12,boxShadow:"0 0 40px rgba(123,98,246,1),0 0 120px rgba(123,98,246,.6),inset 0 1px 0 rgba(255,255,255,.5)",duration:.35,ease:"back.out(2)"},2.9);
tl.to("#§sel",{scale:1.12,opacity:.0,duration:.4},3.0);
tl.fromTo("#§your",{opacity:0,x:cell(2,1).x+10,y:cell(2,1).y-40},{opacity:1,y:cell(2,1).y-58,duration:.4,ease:"back.out(2)"},3.0);
// "Stake on it" (~3.8s)
tl.fromTo("#§stake",{opacity:0,x:cell(2,1).x-30,y:cell(2,1).y-220},{opacity:1,y:cell(2,1).y+118,duration:.55,ease:"bounce.out"},3.7);
// "land close… you still get paid" (~4.9s): proximity wave from 2–1
const c21 = {x:cell(2,1).x+73-20, y:cell(2,1).y+58-20};
["#§rip1","#§rip2"].forEach((r,i)=>{
  tl.fromTo(r,{x:c21.x,y:c21.y,scale:0,opacity:1},{scale:28,opacity:0,duration:1.6,ease:"power2.out"},4.9+i*.45);
});
tilesEls.forEach(t=>{
  const h=+t.dataset.h, a=+t.dataset.a, d=Math.abs(h-2)+Math.abs(a-1);
  if(d===0) return;
  const k = d===1?.55: d===2?.28: d===3?.1:0;
  if(!k) { tl.to(t,{opacity:.35,duration:.4},5.0+d*.25); return; }
  tl.to(t,{backgroundColor:"rgba(0,200,5,"+k+")",borderColor:"rgba(0,200,5,"+(k+.2)+")",
    boxShadow:"0 0 "+(60*k)+"px rgba(0,200,5,"+k+"),inset 0 1px 0 rgba(255,255,255,.3)",color:"#ffffff",duration:.5,ease:"power2.out"},4.9+d*.28);
});
tl.fromTo("#§legend",{opacity:0,y:20},{opacity:1,y:0,duration:.5},5.3);
tl.fromTo("#§lbar",{scaleX:0},{scaleX:1,duration:.8,ease:"power3.out"},5.4);
""")

# ─────────────────────────── Frame 4 — Full time (7s) ───────────────────────
import math
picks = [("2–0", 0), ("2–1", 1), ("1–0", 1), ("3–0", 1), ("3–1", 2), ("1–1", 2), ("0–2", 4), ("1–3", 5)]
angles = [-90, -30, -150, 20, 160, 70, 115, 235]
chips = []
beams = []
OX, OY, RX, RY = 960, 540, 600, 190
for i, ((s, d), ang) in enumerate(zip(picks, angles)):
    a = math.radians(ang)
    cx, cy = OX + RX * math.cos(a), OY + RY * math.sin(a)
    you = s == "2–1"
    cls = "§you" if you else ("§exact" if d == 0 else ("§far" if d >= 3 else ""))
    label = "YOU · 2–1" if you else (s + " · EXACT" if d == 0 else s)
    w = 230 if (you or d == 0) else 150
    chips.append(f'<div class="§glass §chip {cls}" id="§c{i}" data-d="{d}" style="left:{cx - w/2:.0f}px;top:{cy - 34:.0f}px;width:{w}px">'
                 f'<div class="§display §ct">{label}</div><div class="§meter"><i id="§m{i}" style="opacity:1"></i></div></div>')
    if d <= 2:
        beams.append(f'<line class="§beam" id="§b{i}" x1="{OX}" y1="{OY}" x2="{cx:.0f}" y2="{cy:.0f}" stroke-width="{[9,5,2][d]}" pathLength="1"/>'
                     f'<line class="§flow" id="§f{i}" x1="{OX}" y1="{OY}" x2="{cx:.0f}" y2="{cy:.0f}" stroke-width="{[4,3,1.5][d]}"/>')

FRAMES["04-fulltime"] = dict(dur=7, seed=44, css="""
.§shake{position:absolute;inset:0}
.§board{left:640px;top:40px;width:640px;height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.§ft{display:flex;align-items:center;gap:12px;color:#00C805}
.§ftdot{width:10px;height:10px;border-radius:50%;background:#00C805;box-shadow:0 0 12px #00C805}
.§score{font-size:130px;color:#fff;text-shadow:0 0 30px rgba(255,255,255,.6),0 0 80px rgba(123,98,246,.7)}
.§shock{position:absolute;left:910px;top:90px;width:100px;height:100px;border-radius:50%;border:4px solid #fff;box-shadow:0 0 40px #b9a9ff}
.§flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 15%,#fff,rgba(185,169,255,.6) 40%,transparent 80%);opacity:0}
.§orb{position:absolute;left:870px;top:450px;width:180px;height:180px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%,#ffffff 0,#b6ffb8 12%,#00C805 38%,#0b5c14 70%,rgba(0,200,5,0) 72%);
  box-shadow:0 0 60px rgba(0,200,5,.9),0 0 160px rgba(0,200,5,.5),0 0 300px rgba(123,98,246,.4)}
.§orbring{position:absolute;left:830px;top:410px;width:260px;height:260px;border-radius:50%;border:2px dashed rgba(185,169,255,.6)}
.§orblabel{position:absolute;left:760px;top:650px;width:400px;text-align:center;color:#b6ffb8}
.§beams{position:absolute;inset:0;filter:drop-shadow(0 0 10px rgba(0,200,5,.9))}
.§beam{stroke:#00C805;stroke-dasharray:1;stroke-dashoffset:1;stroke-linecap:round}
.§flow{stroke:#eaffea;stroke-dasharray:14 40;opacity:0;stroke-linecap:round}
.§chip{height:68px;border-radius:20px;padding:10px 16px}
.§ct{font-size:24px;text-align:center}
.§meter{height:6px;border-radius:3px;background:rgba(255,255,255,.1);margin-top:8px;overflow:hidden}
.§meter i{display:block;height:100%;width:100%;background:#00C805;box-shadow:0 0 10px #00C805;transform-origin:0 50%}
.§you{background:linear-gradient(135deg,rgba(123,98,246,.75),rgba(78,60,181,.45));border-color:rgba(185,169,255,.8);box-shadow:0 0 40px rgba(123,98,246,.8),inset 0 1px 0 rgba(255,255,255,.5)}
.§exact{border-color:rgba(0,200,5,.8)}
.§head{position:absolute;left:0;right:0;top:790px;text-align:center;font-size:62px;color:#fff}
.§head span{display:inline-block;margin:0 10px}
.§paid{color:#00C805;text-shadow:0 0 24px rgba(0,200,5,.9),0 0 60px rgba(0,200,5,.5)}
""", body=f"""
    <div class="§shake" id="§shake">
      <div class="§flash" id="§flash"></div>
      <div class="§shock" id="§shock"></div>
      <div class="§glass §board" id="§board"><div class="§ft §label"><span class="§ftdot"></span>Full time</div>
        <div class="§score §display">2 – 0</div></div>
      <svg class="§beams" viewBox="0 0 1920 1080" width="1920" height="1080" fill="none">{''.join(beams)}</svg>
      <div class="§orbring" id="§ring"></div>
      <div class="§orb" id="§orb"></div>
      <div class="§orblabel §label" id="§ol">The pool</div>
      {''.join(chips)}
      <div class="§head §display" id="§head"><span>Called 2–1.</span><span>Ended 2–0.</span><span class="§paid">Still paid.</span></div>
    </div>
""", js="""
particles("#§particles", 60, {rise:40});
// FT slam + shockwave + camera shake
tl.fromTo("#§board",{scale:1.8,opacity:0},{scale:1,opacity:1,duration:.35,ease:"expo.in"},0.05);
tl.fromTo("#§flash",{opacity:0},{opacity:.7,duration:.05},0.4); tl.to("#§flash",{opacity:0,duration:.6},0.45);
tl.fromTo("#§shock",{scale:0,opacity:1},{scale:22,opacity:0,duration:1.1,ease:"power2.out"},0.4);
[[14,-8],[-12,10],[9,6],[-6,-5],[3,3],[0,0]].forEach((p,i)=>tl.to("#§shake",{x:p[0],y:p[1],duration:.05},0.4+i*.05));
tl.fromTo("#§shake",{scale:1},{scale:1.04,duration:6.4,ease:"sine.inOut"},0.6);
// the pool comes alive
tl.fromTo("#§orb",{scale:0},{scale:1,duration:.7,ease:"back.out(1.8)"},0.9);
tl.fromTo("#§ring",{scale:0,rotation:0},{scale:1,rotation:40,duration:1,ease:"expo.out"},1.0);
tl.to("#§ring",{rotation:160,duration:5,ease:"none"},2.0);
tl.to("#§orb",{scale:1.08,duration:.6,ease:"sine.inOut",repeat:7,yoyo:true},1.6);
tl.fromTo("#§ol",{opacity:0},{opacity:1,duration:.5},1.3);
$$(".§chip").forEach((c,i)=>tl.fromTo(c,{opacity:0,scale:.6},{opacity:1,scale:1,duration:.45,ease:"back.out(2)"},1.0+i*.07));
// beams stream to the close picks ("the nearer you land…")
$$(".§beam").forEach((b,i)=>tl.fromTo(b,{strokeDashoffset:1},{strokeDashoffset:0,duration:.6,ease:"power2.out"},1.7+i*.12));
$$(".§flow").forEach((f,i)=>{tl.set(f,{opacity:.9},2.2); tl.fromTo(f,{strokeDashoffset:0},{strokeDashoffset:-540,duration:4.8,ease:"none"},2.2);});
$$(".§chip").forEach((c,i)=>{
  const d=+c.dataset.d, share={0:1,1:.62,2:.28}[d];
  if(share) tl.fromTo("#§m"+i,{scaleX:0},{scaleX:share,duration:1.3,ease:"power2.out"},2.1+d*.25);
  else tl.to(c,{opacity:.28,filter:"saturate(0) blur(1px)",duration:.6},2.2);
});
// on-screen proof line
$$("#§head span").forEach((s,i)=>tl.fromTo(s,{opacity:0,y:30,filter:"blur(12px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.55,ease:"expo.out"},3.9+i*.45));
""")

# ─────────────────────────── Frame 5 — The agents (8s) ──────────────────────
cmd = "Read kickoff.cash/llms.txt and play Kickoff for me."
cmd_html = "".join(f'<span class="§ch">{c if c != " " else "&nbsp;"}</span>' for c in cmd)
outs = [("ok", "[ok] agent key verified"), ("ok", "[ok] 10 fixtures loaded"), ("go", "-> placing picks ..."), ("ok", "[ok] 10/10 picks placed")]
out_html = "".join(f'<div class="§out §{c}" id="§o{i}">{t}</div>' for i, (c, t) in enumerate(outs))
node_picks = ["2–1", "1–1", "0–2", "3–1", "1–0", "2–2", "0–0", "2–0", "1–2", "4–1"]
nodes_html = "".join(f'<div class="§node" id="§n{i}"><div class="§pk §display" id="§p{i}">{p}</div></div>' for i, p in enumerate(node_picks))
cards_html = "".join(
    f'<div class="§glass §card" id="§card{i}" data-layout-allow-overlap data-layout-allow-occlusion><svg viewBox="0 0 100 100" width="120" height="120"><circle cx="50" cy="34" r="18" fill="rgba(185,169,255,.5)"/>'
    f'<path d="M14 100 C14 70 30 58 50 58 C70 58 86 70 86 100Z" fill="rgba(185,169,255,.35)"/></svg>'
    f'<div class="§label" style="color:#fff">Player perps</div><div class="§mono" style="font-size:15px;color:#b9a9ff;margin-top:6px">{l}</div></div>'
    for i, l in enumerate(["SHOTS O/U 2.5", "GOALS O/U 0.5", "PASSES O/U 48.5", "SAVES O/U 3.5", "TACKLES O/U 2.5"]))

FRAMES["05-agents"] = dict(dur=8, seed=55, css="""
.§term{left:90px;top:250px;width:880px;height:430px;padding:0;overflow:hidden}
.§tbar{height:52px;display:flex;align-items:center;gap:10px;padding:0 22px;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)}
.§td{width:13px;height:13px;border-radius:50%}
.§tt{margin-left:16px;font-size:14px}
.§tbody{padding:30px 34px;font-family:"JetBrains Mono",monospace;font-size:24px;line-height:1.7}
.§cmdline{position:relative;white-space:nowrap;color:#fff}
.§pr{color:#00C805;margin-right:14px}
.§ch{opacity:0}
.§caret{display:inline-block;width:13px;height:28px;background:#b9a9ff;box-shadow:0 0 12px #7B62F6;vertical-align:-5px;position:absolute;left:38px;top:6px}
.§out{font-size:20px;opacity:0}
.§ok{color:#00C805}.§go{color:#b9a9ff}
.§net{position:absolute;inset:0;filter:drop-shadow(0 0 6px rgba(123,98,246,.9))}
.§link{stroke:#7B62F6;stroke-width:2;stroke-dasharray:1;stroke-dashoffset:1}
.§core{position:absolute;left:1120px;top:380px;width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:40px;color:#fff;
  background:radial-gradient(circle at 40% 35%,#d9d0ff,#7B62F6 45%,#2a1f73 80%);box-shadow:0 0 50px rgba(123,98,246,1),0 0 140px rgba(123,98,246,.6)}
.§node{position:absolute;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.4)}
.§pk{position:absolute;left:34px;top:-10px;padding:6px 12px;border-radius:12px;font-size:22px;background:rgba(0,200,5,.18);border:1px solid rgba(0,200,5,.6);color:#fff;white-space:nowrap}
.§pulse{position:absolute;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 14px #b9a9ff,0 0 28px #7B62F6}
.§ring3d{position:absolute;left:420px;top:300px;width:220px;height:300px;perspective:1600px}
.§carousel{position:absolute;inset:0;transform-style:preserve-3d}
.§card{width:220px;height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;opacity:.5}
.§kicker{position:absolute;left:90px;top:190px}
""", body=f"""
    <div class="§ring3d"><div class="§carousel" id="§car">{cards_html}</div></div>
    <svg class="§net" id="§net" viewBox="0 0 1920 1080" width="1920" height="1080" fill="none"></svg>
    <div class="§core §display" id="§core">AI</div>
    {nodes_html}
    <div class="§label §kicker" id="§kick">Agents · bring your own AI</div>
    <div class="§glass §term" id="§term">
      <div class="§tbar"><span class="§td" style="background:#ff5f57"></span><span class="§td" style="background:#febc2e"></span><span class="§td" style="background:#28c840"></span><span class="§label §tt">agent — kickoff</span></div>
      <div class="§tbody"><div class="§cmdline"><span class="§pr">$</span>{cmd_html}<span class="§caret" id="§caret"></span></div>{out_html}</div>
    </div>
""", js="""
particles("#§particles", 70, {rise:25});
// Player Perps cards orbit on a 3D ring (background layer)
const cards=$$(".§card");
cards.forEach((c,i)=>gsap.set(c,{position:"absolute",left:0,top:0,rotationY:i*72,z:0,transformOrigin:"50% 50% -300px"}));
gsap.set("#§car",{rotationX:-8});
tl.fromTo("#§car",{rotationY:0},{rotationY:-110,duration:D,ease:"none"},0);
tl.fromTo(cards,{opacity:0},{opacity:.55,duration:1,stagger:.1},0.2);
// terminal
tl.fromTo("#§term",{opacity:0,y:40,scale:.96},{opacity:1,y:0,scale:1,duration:.6,ease:"expo.out"},0.05);
tl.fromTo("#§kick",{opacity:0},{opacity:1,duration:.5},0.3);
const chs=$$(".§ch"), CW=14.4, T0=0.5, STEP=0.042;
tl.fromTo(chs,{opacity:0},{opacity:1,duration:.001,stagger:STEP},T0);
tl.fromTo("#§caret",{x:0},{x:chs.length*CW,duration:chs.length*STEP,ease:"steps("+chs.length+")"},T0);
tl.to("#§caret",{opacity:0,duration:.25,repeat:9,yoyo:true,ease:"steps(1)"},T0+chs.length*STEP);
[2.9,3.3,3.7,6.2].forEach((t,i)=>tl.fromTo("#§o"+i,{opacity:0,x:-10},{opacity:1,x:0,duration:.25},t));
// constellation: the agent fans out to every fixture
const core={x:1180,y:440}; const net=$("#§net");
const pos=[[1420,190],[1640,260],[1790,420],[1660,560],[1470,660],[1300,760],[1720,760],[1360,320],[1560,430],[1840,610]];
tl.fromTo("#§core",{scale:0,opacity:0},{scale:1,opacity:1,duration:.6,ease:"back.out(2)"},3.2);
tl.to("#§core",{scale:1.08,duration:.5,repeat:7,yoyo:true,ease:"sine.inOut"},3.85);
pos.forEach((p,i)=>{
  const n=$("#§n"+i); n.style.left=(p[0]-13)+"px"; n.style.top=(p[1]-13)+"px";
  const ln=document.createElementNS("http://www.w3.org/2000/svg","line");
  ln.setAttribute("x1",core.x);ln.setAttribute("y1",core.y);ln.setAttribute("x2",p[0]);ln.setAttribute("y2",p[1]);
  ln.setAttribute("pathLength","1");ln.setAttribute("class","§link");net.appendChild(ln);
  const pu=document.createElement("div");pu.className="§pulse";$("#§stage").appendChild(pu);
  const t=3.6+i*.24;
  tl.fromTo(n,{opacity:0,scale:.3},{opacity:1,scale:1,duration:.4,ease:"back.out(2)"},3.0+i*.05);
  tl.fromTo(ln,{strokeDashoffset:1},{strokeDashoffset:0,duration:.45,ease:"power2.out"},t);
  tl.fromTo(pu,{x:core.x-5,y:core.y-5,opacity:0},{x:p[0]-5,y:p[1]-5,opacity:1,duration:.45,ease:"power2.in"},t);
  tl.to(pu,{opacity:0,scale:3,duration:.3},t+.45);
  tl.to(n,{backgroundColor:"#00C805",borderColor:"#b6ffb8",boxShadow:"0 0 24px #00C805",duration:.2},t+.45);
  tl.fromTo("#§p"+i,{opacity:0,x:-10},{opacity:1,x:0,duration:.35,ease:"expo.out"},t+.5);
});
tl.fromTo("#§net",{opacity:1},{opacity:.7,duration:1.5},6.4);
""")

# ─────────────────────────── Frame 6 — The climb (6s) ───────────────────────
handles = ["north_bank", "xg_hunter", "late_winner", "the_gaffer", "cleansheet", "row_z", "agent_7b62", "YOU"]
scores = [.92, .86, .8, .74, .68, .6, .52, .97]
rows_html = ""
for i, (h, s) in enumerate(zip(handles, scores)):
    you = h == "YOU"
    rows_html += (f'<div class="§row {"§me" if you else ""}" id="§r{i}"><span class="§h">{h}</span>'
                  f'<div class="§track"><i id="§bar{i}" data-s="{s}"></i></div><span class="§pts §mono">{int(s*1000)}</span></div>')
ranks_html = "".join(f'<div class="§rank §display">{i+1:02d}</div>' for i in range(8))

FRAMES["06-climb"] = dict(dur=6, seed=66, css="""
.§cam{position:absolute;inset:0;perspective:1600px}
.§board{left:170px;top:170px;width:960px;height:720px;padding:34px 40px}
.§bh{display:flex;justify-content:space-between;margin-bottom:22px}
.§list{position:relative;height:576px}
.§ranks{position:absolute;left:0;top:0;width:70px}
.§rank{height:72px;display:flex;align-items:center;font-size:28px;color:#5E5B7A}
.§rows{position:absolute;left:80px;right:0;top:0}
.§row{position:absolute;left:0;right:0;height:60px;display:flex;align-items:center;gap:22px;padding:0 20px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.§h{width:190px;font-family:"JetBrains Mono",monospace;font-size:20px;color:#d8d6ea}
.§track{flex:1;height:10px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden}
.§track i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#4E3CB5,#7B62F6);transform-origin:0 50%}
.§pts{width:70px;text-align:right;font-size:20px;color:#A6A3C2}
.§me{background:linear-gradient(90deg,rgba(123,98,246,.7),rgba(78,60,181,.35));border-color:rgba(185,169,255,.9);box-shadow:0 0 40px rgba(123,98,246,.8);z-index:5}
.§me .§h,.§me .§pts{color:#fff}
.§me .§track i{background:linear-gradient(90deg,#7B62F6,#00C805)}
.§crown{position:absolute;right:-18px;top:-18px;padding:6px 12px;border-radius:999px;background:#00C805;color:#05060A;font-size:14px;font-weight:600;letter-spacing:.2em;box-shadow:0 0 20px #00C805}
.§pool{position:absolute;left:1300px;top:260px;width:460px;height:460px}
.§rays{position:absolute;left:-160px;top:-160px;width:780px;height:780px}
.§core{position:absolute;inset:80px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff 0,#b6ffb8 10%,#00C805 36%,#0b5c14 66%,rgba(0,200,5,0) 70%);box-shadow:0 0 80px rgba(0,200,5,.9),0 0 220px rgba(0,200,5,.45),0 0 360px rgba(123,98,246,.35)}
.§halo{position:absolute;inset:30px;border-radius:50%;border:2px solid rgba(185,169,255,.5)}
.§pl{position:absolute;left:1250px;width:560px;text-align:center}
""", body=f"""
    <div class="§cam"><div class="§glass §board" id="§board">
      <div class="§bh"><span class="§label" style="color:#fff">Leaderboard · season</span><span class="§label">Points</span></div>
      <div class="§list"><div class="§ranks">{ranks_html}</div><div class="§rows">{rows_html}</div></div>
    </div></div>
    <div class="§pool" id="§pool"><svg class="§rays" id="§rays" viewBox="-390 -390 780 780"><defs><radialGradient id="§rg" cx="0" cy="0" r="390" gradientUnits="userSpaceOnUse"><stop offset=".25" stop-color="#00C805" stop-opacity=".55"/><stop offset="1" stop-color="#00C805" stop-opacity="0"/></radialGradient></defs><g fill="url(#§rg)"><polygon points="0.0,0.0 389.7,-15.0 389.7,15.0"/><polygon points="0.0,0.0 384.3,66.4 378.1,95.7"/><polygon points="0.0,0.0 362.1,144.8 349.9,172.2"/><polygon points="0.0,0.0 324.1,217.0 306.5,241.2"/><polygon points="0.0,0.0 271.9,279.6 249.6,299.6"/><polygon points="0.0,0.0 207.8,330.0 181.9,345.0"/><polygon points="0.0,0.0 134.7,366.0 106.2,375.3"/><polygon points="0.0,0.0 55.6,386.0 25.8,389.1"/><polygon points="0.0,0.0 -25.8,389.1 -55.6,386.0"/><polygon points="0.0,0.0 -106.2,375.3 -134.7,366.0"/><polygon points="0.0,0.0 -181.9,345.0 -207.8,330.0"/><polygon points="0.0,0.0 -249.6,299.6 -271.9,279.6"/><polygon points="0.0,0.0 -306.5,241.2 -324.1,217.0"/><polygon points="0.0,0.0 -349.9,172.2 -362.1,144.8"/><polygon points="0.0,0.0 -378.1,95.7 -384.3,66.4"/><polygon points="0.0,0.0 -389.7,15.0 -389.7,-15.0"/><polygon points="0.0,0.0 -384.3,-66.4 -378.1,-95.7"/><polygon points="0.0,0.0 -362.1,-144.8 -349.9,-172.2"/><polygon points="0.0,0.0 -324.1,-217.0 -306.5,-241.2"/><polygon points="0.0,0.0 -271.9,-279.6 -249.6,-299.6"/><polygon points="0.0,0.0 -207.8,-330.0 -181.9,-345.0"/><polygon points="0.0,0.0 -134.7,-366.0 -106.2,-375.3"/><polygon points="0.0,0.0 -55.6,-386.0 -25.8,-389.1"/><polygon points="0.0,0.0 25.8,-389.1 55.6,-386.0"/><polygon points="0.0,0.0 106.2,-375.3 134.7,-366.0"/><polygon points="0.0,0.0 181.9,-345.0 207.8,-330.0"/><polygon points="0.0,0.0 249.6,-299.6 271.9,-279.6"/><polygon points="0.0,0.0 306.5,-241.2 324.1,-217.0"/><polygon points="0.0,0.0 349.9,-172.2 362.1,-144.8"/><polygon points="0.0,0.0 378.1,-95.7 384.3,-66.4"/></g></svg><div class="§halo" id="§halo"></div><div class="§core" id="§pcore"></div></div>
    <div class="§pl §display" id="§pl1" style="top:770px;font-size:44px">Season accumulator</div>
    <div class="§pl §label" id="§pl2" style="top:834px;color:#b6ffb8">Top 20 share the pool</div>
""", js="""
particles("#§particles", 90, {rise:120});
gsap.set("#§board",{transformOrigin:"50% 50%"});
tl.fromTo("#§board",{rotationY:22,rotationX:8,opacity:0,x:-80},{rotationY:-6,rotationX:4,opacity:1,x:0,duration:1,ease:"expo.out"},0);
tl.to("#§board",{rotationY:-14,duration:5,ease:"sine.inOut"},1);
const rows=$$(".§row");
rows.forEach((r,i)=>gsap.set(r,{y:i*72}));
rows.forEach((r,i)=>tl.fromTo(r,{opacity:0,x:-30},{opacity:1,x:0,duration:.4,ease:"expo.out"},0.15+i*.05));
$$(".§track i").forEach((b,i)=>tl.fromTo(b,{scaleX:0},{scaleX:i===7?.52:+b.dataset.s,duration:.8,ease:"power3.out"},0.3+i*.05));
// "Climb the board" (~0.8s): YOU rises from 08 to 01
const me=$("#§r7");
tl.to(me,{y:0,duration:1.7,ease:"power3.inOut"},0.8);
for(let k=6;k>=0;k--){ tl.to("#§r"+k,{y:(k+1)*72,duration:.35,ease:"power2.inOut"},0.8+(6-k)*.2+.1); }
tl.to("#§bar7",{scaleX:.97,duration:1.6,ease:"power3.inOut"},0.8);
const cr=document.createElement("div");cr.className="§crown";cr.textContent="#1";me.appendChild(cr);
tl.fromTo(cr,{scale:0,opacity:0},{scale:1,opacity:1,duration:.4,ease:"back.out(3)"},2.45);
// "Chase the season's pool" (~2.1s)
tl.fromTo("#§pool",{scale:.4,opacity:0},{scale:1,opacity:1,duration:1,ease:"expo.out"},1.9);
tl.fromTo("#§rays",{rotation:0},{rotation:70,duration:4.1,ease:"none"},1.9);
tl.fromTo("#§halo",{scale:.6,opacity:1},{scale:1.5,opacity:0,duration:1.2,ease:"power2.out",repeat:2},2.1);
tl.to("#§pcore",{scale:1.06,duration:.45,repeat:7,yoyo:true,ease:"sine.inOut"},2.4);
tl.fromTo("#§pl1",{opacity:0,y:20},{opacity:1,y:0,duration:.6,ease:"expo.out"},2.3);
tl.fromTo("#§pl2",{opacity:0},{opacity:1,duration:.6},2.7);
""")

# ─────────────────────────── Frame 7 — Lockup (5s) ──────────────────────────
N = 3
shard_html = ""
k = 0
for r in range(N):
    for c in range(N):
        x0, y0, x1, y1 = round(c * 100/3, 2), round(r * 100/3, 2), round((c + 1) * 100/3, 2), round((r + 1) * 100/3, 2)
        for poly in [f"{x0}% {y0}%,{x1}% {y0}%,{x0}% {y1}%", f"{x1}% {y0}%,{x1}% {y1}%,{x0}% {y1}%"]:
            shard_html += f'<div class="§piece" id="§pc{k}" style="clip-path:polygon({poly})"></div>'
            k += 1
word_html = "".join(f'<span class="§L">{ch}</span>' for ch in "KICKOFF")

FRAMES["07-lockup"] = dict(dur=5, seed=77, css="""
.§fog{position:absolute;width:1200px;height:600px;border-radius:50%;filter:blur(80px);opacity:.5}
.§lock{position:absolute;left:0;right:0;top:250px;height:280px;display:flex;align-items:center;justify-content:center;gap:56px}
.§logo{position:relative;width:260px;height:260px;filter:drop-shadow(0 0 24px rgba(123,98,246,.9)) drop-shadow(0 0 60px rgba(123,98,246,.5))}
.§piece{position:absolute;inset:0;background:url("assets/brand/kickoff-logo-white.svg") center/contain no-repeat}
.§word{position:relative;font-size:190px;color:#fff;text-shadow:0 0 30px rgba(123,98,246,.8),0 0 90px rgba(123,98,246,.5);white-space:nowrap}
.§L{display:inline-block}
.§wr,.§wc{position:absolute;left:0;top:0;mix-blend-mode:screen;opacity:0;text-shadow:none}
.§wr{color:#ff2d55}.§wc{color:#22d3ee}
.§tag{position:absolute;left:0;right:0;top:580px;text-align:center;font-size:72px;color:#d8d6ea}
.§tag span{display:inline-block;margin:0 14px}
.§keep{color:#fff;text-shadow:0 0 24px rgba(0,200,5,.8),0 0 60px rgba(0,200,5,.45)}
.§url{left:780px;top:720px;width:360px;height:76px;display:flex;align-items:center;justify-content:center;font-size:34px;border-radius:38px;overflow:hidden}
.§sheen{position:absolute;top:-20px;left:0;width:120px;height:140px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);transform-origin:50% 50%}
.§legal{position:absolute;left:0;right:0;top:826px;text-align:center;font-size:16px;color:#B8B5D4}
.§black{position:absolute;inset:0;background:#000;opacity:0}
.§burst{position:absolute;left:0;right:0;top:0;height:1080px;background:radial-gradient(circle at 36% 36%,rgba(255,255,255,.9),rgba(185,169,255,.35) 18%,transparent 45%);opacity:0;mix-blend-mode:screen}
""", bg_extra="""
    <div class="§fog" id="§fog1" style="left:-200px;top:520px;background:rgba(123,98,246,.55)"></div>
    <div class="§fog" id="§fog2" style="left:900px;top:-200px;background:rgba(78,60,181,.6)"></div>
    <div class="§fog" id="§fog3" style="left:700px;top:700px;background:rgba(0,200,5,.18)"></div>""", body=f"""
    <div class="§lock"><div class="§logo" id="§logo">{shard_html}</div>
      <div class="§word §display" id="§word">{word_html}<div class="§wr" id="§wr" data-layout-allow-overlap>KICKOFF</div><div class="§wc" id="§wc" data-layout-allow-overlap>KICKOFF</div></div></div>
    <div class="§burst" id="§burst"></div>
    <div class="§tag §display" id="§tag"><span id="§t1">Beat the pack.</span><span class="§keep" id="§t2">Keep the stack.</span></div>
    <div class="§glass §url §display" id="§url" style="position:absolute">kickoff.cash<div class="§sheen" id="§sheen"></div></div>
    <div class="§legal §label" id="§legal">18+ · Play responsibly</div>
    <div class="§black" id="§black"></div>
""", js="""
particles("#§particles", 80, {rise:30});
tl.fromTo("#§fog1",{x:0},{x:260,duration:D,ease:"sine.inOut"},0);
tl.fromTo("#§fog2",{x:0},{x:-260,duration:D,ease:"sine.inOut"},0);
tl.fromTo("#§fog3",{opacity:0},{opacity:.5,duration:2},0.5);
// glass shards fly in through the fog and tile into the Kickoff mark
$$(".§piece").forEach((p,i)=>{
  tl.fromTo(p,{x:R(-900,900),y:R(-520,520),rotation:R(-240,240),scale:R(.4,1.8),opacity:0},
    {x:0,y:0,rotation:0,scale:1,opacity:1,duration:R(.7,1.0),ease:"expo.out"},0.05+R(0,.25));
});
tl.fromTo("#§burst",{opacity:0},{opacity:1,duration:.08},1.15); tl.to("#§burst",{opacity:0,duration:.7},1.25);
tl.fromTo("#§logo",{scale:1},{scale:1.04,duration:.3,ease:"power2.out",yoyo:true,repeat:1},1.15);
// "Kickoff" (~1.1s)
tl.fromTo("#§word .§L",{opacity:0,y:60,filter:"blur(14px)"},{opacity:1,y:0,filter:"blur(0px)",duration:.55,stagger:.05,ease:"expo.out"},1.15);
[1.3,1.36,2.2,3.3].forEach(t=>{
  tl.set("#§wr",{opacity:.8,x:-8},t); tl.set("#§wc",{opacity:.8,x:8},t);
  tl.set("#§wr",{opacity:0,x:0},t+.06); tl.set("#§wc",{opacity:0,x:0},t+.06);
});
// tagline on the voice
tl.fromTo("#§t1",{opacity:0,y:24},{opacity:1,y:0,duration:.5,ease:"expo.out"},1.95);
tl.fromTo("#§t2",{opacity:0,y:24,scale:.96},{opacity:1,y:0,scale:1,duration:.55,ease:"expo.out"},2.95);
tl.fromTo("#§url",{opacity:0,y:20},{opacity:1,y:0,duration:.5,ease:"expo.out"},3.35);
tl.fromTo("#§sheen",{x:-160,rotation:20},{x:420,rotation:20,duration:.8,ease:"power2.inOut"},3.7);
tl.fromTo("#§legal",{opacity:0},{opacity:1,duration:.5},3.6);
tl.fromTo("#§black",{opacity:0},{opacity:1,duration:.45,ease:"power1.in"},4.55);
""")


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "compositions", "frames")
    os.makedirs(out, exist_ok=True)
    for fid, f in FRAMES.items():
        html = frame(fid, f["dur"], f["seed"], f["css"], f["body"], f["js"], f.get("bg_extra", ""))
        with open(os.path.join(out, fid + ".html"), "w") as fh:
            fh.write(html)
        print("wrote", fid)


if __name__ == "__main__":
    main()
