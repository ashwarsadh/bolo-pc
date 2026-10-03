/*
 * Bolo setup page: which file does this visitor need? (g1103)
 * classify() is pure so it can be unit-tested; the page feeds it what the browser exposes.
 *   win        Windows, clearly          -> download starts by itself
 *   mac-arm    Mac, Apple silicon, from a reliable signal -> download starts by itself
 *   mac-intel  Mac, Intel, from a reliable signal         -> download starts by itself
 *   mac        Mac, chip unknown         -> ask which chip
 *   phone      Android / iPhone / iPad   -> no download; "open this link on your computer"
 *   unknown    anything else             -> manual choice
 * Reliable chip signals: Chromium's userAgentData architecture on macOS, or a WebGL renderer that
 * names the chip ("Apple M1", "Intel(R) Iris"). Safari reports a generic "Apple GPU" on every Mac,
 * so that alone is NOT treated as Apple silicon.
 */
(function (root) {
  function classify(input) {
    var ua = input.ua || '';
    var platform = input.uaPlatform || '';          // navigator.userAgentData.platform, if any
    var arch = input.uaArch || '';                  // getHighEntropyValues(['architecture'])
    var gpu = input.gpu || '';                      // WEBGL_debug_renderer_info renderer
    var touch = input.maxTouchPoints || 0;

    if (/Android|iPhone|iPod/i.test(ua) || /iPad/i.test(ua) || (/Macintosh/.test(ua) && touch > 1)) {
      return { kind: 'phone', why: 'phone or tablet user agent' };
    }
    if (/Windows NT/i.test(ua) && !/Windows Phone/i.test(ua)) {
      return { kind: 'win', why: 'Windows user agent' };
    }
    if (/Macintosh|Mac OS X/.test(ua)) {
      if (platform === 'macOS' && arch === 'arm') return { kind: 'mac-arm', why: 'browser reports arm architecture' };
      if (platform === 'macOS' && arch === 'x86') return { kind: 'mac-intel', why: 'browser reports x86 architecture' };
      if (/Apple M\d/i.test(gpu)) return { kind: 'mac-arm', why: 'graphics chip is ' + gpu };
      if (/Intel|AMD|Radeon|NVIDIA/i.test(gpu)) return { kind: 'mac-intel', why: 'graphics chip is ' + gpu };
      return { kind: 'mac', why: 'Mac, chip not reported by this browser' };
    }
    return { kind: 'unknown', why: 'system not recognised' };
  }
  var FILES = {
    'win': 'https://github.com/ashwarsadh/bolo-pc/releases/latest/download/Bolo-Server-windows.zip',
    'mac-arm': 'https://github.com/ashwarsadh/bolo-pc/releases/latest/download/Bolo-mac-arm64.zip',
    'mac-intel': 'https://github.com/ashwarsadh/bolo-pc/releases/latest/download/Bolo-mac-x64.zip'
  };
  var api = { classify: classify, FILES: FILES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BoloDetect = api;
})(this);
