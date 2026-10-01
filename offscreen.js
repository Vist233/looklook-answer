chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'offscreen' || message.type !== 'prepare-image') return;
  (async () => {
    const image = await createImageBitmap(await (await fetch(message.image)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const sx = canvas.width / message.viewport.width, sy = canvas.height / message.viewport.height;
    const rect = message.rect;
    if (rect) {
      ctx.fillStyle = '#e8eceb';
      ctx.fillRect(Math.floor(rect.x*sx)-3, Math.floor(rect.y*sy)-3, Math.ceil(rect.width*sx)+6, Math.ceil(rect.height*sy)+6);
    }
    image.close();
    const data = canvas.toDataURL('image/png');
    reply({ ok: true, image: data });
  })().catch(() => reply({ ok: false, error: '截图处理失败。' }));
  return true;
});
