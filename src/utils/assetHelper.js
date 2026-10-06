export const getAssetUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const baseUrl = import.meta.env.BASE_URL || '/';
  return baseUrl.endsWith('/') ? `${baseUrl}${cleanPath}` : `${baseUrl}/${cleanPath}`;
};

/**
 * Compress image file using HTML5 Canvas (resizes large photos & reduces quality to JPEG ~50KB)
 */
export const compressImageFile = (file, maxWidth = 400, quality = 0.55) => {
  return new Promise((resolve) => {
    if (!file) return resolve('');
    if (file.type === 'image/svg+xml' || file.size < 40000) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

export const getProductImages = (product) => {
  if (!product) return [];
  if (Array.isArray(product.images) && product.images.length > 0) {
    const valid = product.images.filter((img) => img && typeof img === 'string' && img.trim() !== '');
    if (valid.length > 0) return valid;
  }
  if (product.image) {
    return [product.image];
  }
  return ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop'];
};


