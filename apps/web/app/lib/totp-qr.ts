/** The setup link as a QR code, an SVG in a data URL: drawn in the browser, nothing leaves the page, and `img-src data:` covers it. */
export const totpQrDataUrl = async (totpUri: string): Promise<string> => {
  const module = await import('qrcode')
  const svg = await (module.default ?? module).toString(totpUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
