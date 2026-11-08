// 网页只加载展示图，生成高清长图时才读取 original。
const characterImages = {
  "CONTR": {
    "display": "assets/display/CONTR.webp",
    "halloween": "assets/display/halloween/CONTR.webp",
    "christmas": "assets/display/christmas/CONTR.webp",
    "spring": "assets/display/spring/CONTR.webp",
    "qingming": "assets/display/qingming/CONTR.webp",
    "midautumn": "assets/display/midautumn/CONTR.webp",
    "nailong": "assets/display/nailong/CONTR.jpg",
    "original": "assets/original/CONTR.png"
  },
  "DATA": {
    "display": "assets/display/DATA.webp",
    "halloween": "assets/display/halloween/DATA.webp",
    "christmas": "assets/display/christmas/DATA.webp",
    "spring": "assets/display/spring/DATA.webp",
    "qingming": "assets/display/qingming/DATA.webp",
    "midautumn": "assets/display/midautumn/DATA.webp",
    "nailong": "assets/display/nailong/DATA.jpg",
    "original": "assets/original/DATA.png"
  },
  "DIVE": {
    "display": "assets/display/DIVE.webp",
    "halloween": "assets/display/halloween/DIVE.webp",
    "christmas": "assets/display/christmas/DIVE.webp",
    "spring": "assets/display/spring/DIVE.webp",
    "qingming": "assets/display/qingming/DIVE.webp",
    "midautumn": "assets/display/midautumn/DIVE.webp",
    "nailong": "assets/display/nailong/DIVE.png",
    "original": "assets/original/DIVE.png"
  },
  "DIVI": {
    "display": "assets/display/DIVI.webp",
    "halloween": "assets/display/halloween/DIVI.webp",
    "christmas": "assets/display/christmas/DIVI.webp",
    "spring": "assets/display/spring/DIVI.webp",
    "qingming": "assets/display/qingming/DIVI.webp",
    "midautumn": "assets/display/midautumn/DIVI.webp",
    "nailong": "assets/display/nailong/DIVI.jpg",
    "original": "assets/original/DIVI.png"
  },
  "GROW": {
    "display": "assets/display/GROW.webp",
    "halloween": "assets/display/halloween/GROW.webp",
    "christmas": "assets/display/christmas/GROW.webp",
    "spring": "assets/display/spring/GROW.webp",
    "qingming": "assets/display/qingming/GROW.webp",
    "midautumn": "assets/display/midautumn/GROW.webp",
    "nailong": "assets/display/nailong/GROW.jpg",
    "original": "assets/original/GROW.png"
  },
  "HOLD": {
    "display": "assets/display/HOLD.webp",
    "halloween": "assets/display/halloween/HOLD.webp",
    "christmas": "assets/display/christmas/HOLD.webp",
    "spring": "assets/display/spring/HOLD.webp",
    "qingming": "assets/display/qingming/HOLD.webp",
    "midautumn": "assets/display/midautumn/HOLD.webp",
    "nailong": "assets/display/nailong/HOLD.jpg",
    "original": "assets/original/HOLD.png"
  },
  "HYPE": {
    "display": "assets/display/HYPE.webp",
    "halloween": "assets/display/halloween/HYPE.webp",
    "christmas": "assets/display/christmas/HYPE.webp",
    "spring": "assets/display/spring/HYPE.webp",
    "qingming": "assets/display/qingming/HYPE.webp",
    "midautumn": "assets/display/midautumn/HYPE.webp",
    "nailong": "assets/display/nailong/HYPE.jpg",
    "original": "assets/original/HYPE.png"
  },
  "LEVER": {
    "display": "assets/display/LEVER.webp",
    "halloween": "assets/display/halloween/LEVER.webp",
    "christmas": "assets/display/christmas/LEVER.webp",
    "spring": "assets/display/spring/LEVER.webp",
    "qingming": "assets/display/qingming/LEVER.webp",
    "midautumn": "assets/display/midautumn/LEVER.webp",
    "nailong": "assets/display/nailong/LEVER.jpg",
    "original": "assets/original/LEVER.png"
  },
  "LONG": {
    "display": "assets/display/LONG.webp",
    "halloween": "assets/display/halloween/LONG.webp",
    "christmas": "assets/display/christmas/LONG.webp",
    "spring": "assets/display/spring/LONG.webp",
    "qingming": "assets/display/qingming/LONG.webp",
    "midautumn": "assets/display/midautumn/LONG.webp",
    "nailong": "assets/display/nailong/LONG.jpg",
    "original": "assets/original/LONG.png"
  },
  "MACRO": {
    "display": "assets/display/MACRO.webp",
    "halloween": "assets/display/halloween/MACRO.webp",
    "christmas": "assets/display/christmas/MACRO.webp",
    "spring": "assets/display/spring/MACRO.webp",
    "qingming": "assets/display/qingming/MACRO.webp",
    "midautumn": "assets/display/midautumn/MACRO.webp",
    "nailong": "assets/display/nailong/MACRO.jpg",
    "original": "assets/original/MACRO.png"
  },
  "SCALP": {
    "display": "assets/display/SCALP.webp",
    "halloween": "assets/display/halloween/SCALP.webp",
    "christmas": "assets/display/christmas/SCALP.webp",
    "spring": "assets/display/spring/SCALP.webp",
    "qingming": "assets/display/qingming/SCALP.webp",
    "midautumn": "assets/display/midautumn/SCALP.webp",
    "nailong": "assets/display/nailong/SCALP.jpg",
    "original": "assets/original/SCALP.png"
  },
  "SECT": {
    "display": "assets/display/SECT.webp",
    "halloween": "assets/display/halloween/SECT.webp",
    "christmas": "assets/display/christmas/SECT.webp",
    "spring": "assets/display/spring/SECT.webp",
    "qingming": "assets/display/qingming/SECT.webp",
    "midautumn": "assets/display/midautumn/SECT.webp",
    "nailong": "assets/display/nailong/SECT.jpg",
    "original": "assets/original/SECT.png"
  },
  "SWING": {
    "display": "assets/display/SWING.webp",
    "halloween": "assets/display/halloween/SWING.webp",
    "christmas": "assets/display/christmas/SWING.webp",
    "spring": "assets/display/spring/SWING.webp",
    "qingming": "assets/display/qingming/SWING.webp",
    "midautumn": "assets/display/midautumn/SWING.webp",
    "nailong": "assets/display/nailong/SWING.jpg",
    "original": "assets/original/SWING.png"
  },
  "TECH": {
    "display": "assets/display/TECH.webp",
    "halloween": "assets/display/halloween/TECH.webp",
    "christmas": "assets/display/christmas/TECH.webp",
    "spring": "assets/display/spring/TECH.webp",
    "qingming": "assets/display/qingming/TECH.webp",
    "midautumn": "assets/display/midautumn/TECH.webp",
    "nailong": "assets/display/nailong/TECH.jpg",
    "original": "assets/original/TECH.png"
  },
  "TREND": {
    "display": "assets/display/TREND.webp",
    "halloween": "assets/display/halloween/TREND.webp",
    "christmas": "assets/display/christmas/TREND.webp",
    "spring": "assets/display/spring/TREND.webp",
    "qingming": "assets/display/qingming/TREND.webp",
    "midautumn": "assets/display/midautumn/TREND.webp",
    "nailong": "assets/display/nailong/TREND.jpg",
    "original": "assets/original/TREND.png"
  },
  "VALU": {
    "display": "assets/display/VALU.webp",
    "halloween": "assets/display/halloween/VALU.webp",
    "christmas": "assets/display/christmas/VALU.webp",
    "spring": "assets/display/spring/VALU.webp",
    "qingming": "assets/display/qingming/VALU.webp",
    "midautumn": "assets/display/midautumn/VALU.webp",
    "nailong": "assets/display/nailong/VALU.jpg",
    "original": "assets/original/VALU.png"
  }
};
