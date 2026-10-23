// 路徑小工具：全部是純函式，不碰磁碟
export const slash = (p: string) => {
  const s = p.replace(/\\/g, '/')
  // 根目錄的斜線不能刪：C:/ 變成 C: 會被當成相對路徑，slug 也會少一碼。
  return /^(?:[A-Za-z]:|\/\/\?\/[A-Za-z]:)?\/+$/i.test(s) ? s.replace(/\/+$/, '/') : s.replace(/\/+$/, '')
}
// Claude Code 2.1.299 的 _ae 原文，僅補上參數型別；以 UTF-16 字碼累積有號 32 位元雜湊。
function _ae(t: string){let e=0;for(let n=0;n<t.length;n++)e=(e<<5)-e+t.charCodeAt(n)|0;return e}
export const encodeProject = (p: string) => {
  const slug = (p.length <= 200 ? slash(p) : p).replace(/[^A-Za-z0-9]/g, '-')
  // 短路徑沿用既有行為；長路徑雜湊原始字串，不能先換掉 Windows 的反斜線。
  return slug.length <= 200 ? slug : `${slug.slice(0, 200)}-${Math.abs(_ae(p)).toString(36)}`
}
export const isAbs = (p: string) => /^[A-Za-z]:\//.test(p) || p.startsWith('/')

// 去掉空段、. 和 ..；磁碟根目錄與 UNC 的分享根目錄都不能被 .. 移除。
export function resolveDots(p: string) {
  const s = slash(p)
  const root = /^(?:\/\/\?\/UNC\/[^/]+\/[^/]+|\/\/[^/]+\/[^/]+|[A-Za-z]:\/|\/)/i.exec(s)?.[0] ?? ''
  const parts: string[] = []
  for (const seg of s.slice(root.length).split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (parts.length && parts.at(-1) !== '..') parts.pop()
      else if (!root) parts.push(seg)
      continue
    }
    parts.push(seg)
  }
  return root + (root && !root.endsWith('/') && parts.length ? '/' : '') + parts.join('/')
}
