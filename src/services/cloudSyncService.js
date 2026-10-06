import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDocs 
} from '../firebase/config';

// Dedicated Global Cloud Storage ID for DZONE COLLECTION SURAT
let CLOUD_STORE_ID = 'ff808181a09d98f701a10b9582c77c45';
const STORAGE_CLOUD_ID_KEY = 'dzone_cloud_store_id_v2';

// Retrieve or fallback active cloud storage ID
try {
  const savedId = localStorage.getItem(STORAGE_CLOUD_ID_KEY);
  if (savedId && savedId.trim() !== '') {
    CLOUD_STORE_ID = savedId.trim();
  }
} catch (e) {}

let CLOUD_STORE_URL = `https://api.restful-api.dev/objects/${CLOUD_STORE_ID}`;

const DB_COLLECTION_PRODUCTS = 'dzone_products';
const DB_COLLECTION_MEDIA = 'dzone_media';
const DB_COLLECTION_REVIEWS = 'dzone_reviews';
const DB_COLLECTION_ORDERS = 'dzone_orders';

// Setup BroadcastChannel for real-time same-device tab/window syncing
let liveChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    liveChannel = new BroadcastChannel('dzone_cross_device_sync_channel');
  }
} catch (e) {}

// In-memory cache for full payload sync
let currentCloudCache = {
  products: null,
  media: null,
  reviews: null,
  orders: null
};

// Helper: Ensure images or large payloads don't exceed server payload limits
const sanitizeForCloud = (dataContainer) => {
  if (!dataContainer || typeof dataContainer !== 'object') return dataContainer;
  const clone = JSON.parse(JSON.stringify(dataContainer));

  if (Array.isArray(clone.products)) {
    clone.products = clone.products.map((p) => {
      if (!p) return p;
      let sanitizedP = { ...p };
      if (sanitizedP.image && typeof sanitizedP.image === 'string' && sanitizedP.image.startsWith('data:') && sanitizedP.image.length > 90000) {
        sanitizedP.image = sanitizedP.image.substring(0, 90000);
      }
      if (Array.isArray(sanitizedP.images)) {
        sanitizedP.images = sanitizedP.images.map((img) => {
          if (img && typeof img === 'string' && img.startsWith('data:') && img.length > 90000) {
            return img.substring(0, 90000);
          }
          return img;
        });
      }
      return sanitizedP;
    });
  }
  return clone;
};

/**
 * Fetch full data container from Cloud Storage across all devices
 */
export const fetchFullCloudData = async () => {
  try {
    // 1. Try Firebase Firestore first if initialized
    if (db) {
      try {
        const productsSnap = await getDocs(collection(db, DB_COLLECTION_PRODUCTS));
        const fbProducts = [];
        productsSnap.forEach((docSnap) => fbProducts.push({ id: docSnap.id, ...docSnap.data() }));

        const mediaSnap = await getDocs(collection(db, DB_COLLECTION_MEDIA));
        let fbMedia = null;
        mediaSnap.forEach((d) => { if (d.id === 'main_banner') fbMedia = d.data(); });

        const reviewsSnap = await getDocs(collection(db, DB_COLLECTION_REVIEWS));
        const fbReviews = [];
        reviewsSnap.forEach((docSnap) => fbReviews.push({ id: docSnap.id, ...docSnap.data() }));

        const ordersSnap = await getDocs(collection(db, DB_COLLECTION_ORDERS));
        const fbOrders = [];
        ordersSnap.forEach((docSnap) => fbOrders.push({ id: docSnap.id, ...docSnap.data() }));

        if (fbProducts.length > 0 || fbMedia || fbReviews.length > 0 || fbOrders.length > 0) {
          return {
            products: fbProducts.length > 0 ? fbProducts : null,
            media: fbMedia,
            reviews: fbReviews.length > 0 ? fbReviews : null,
            orders: fbOrders.length > 0 ? fbOrders : null
          };
        }
      } catch (fbErr) {
        console.warn('Firebase Firestore read fallback:', fbErr);
      }
    }

    // 2. Fetch from Global Public Cloud REST Store
    const res = await fetch(CLOUD_STORE_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const result = await res.json();
      if (result && result.data && typeof result.data === 'object') {
        currentCloudCache = { ...currentCloudCache, ...result.data };
        return result.data;
      }
    } else if (res.status === 404) {
      // Re-create bucket if lost
      await recreateCloudStore();
    }
  } catch (err) {
    console.warn('Cloud sync fetch warning:', err);
  }
  return null;
};

/**
 * Re-create cloud store bucket if endpoint resets
 */
const recreateCloudStore = async () => {
  try {
    const res = await fetch('https://api.restful-api.dev/objects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'DZONE_COLLECTION_SURAT_GLOBAL_STORE_V2',
        data: currentCloudCache
      })
    });
    if (res.ok) {
      const created = await res.json();
      if (created && created.id) {
        CLOUD_STORE_ID = created.id;
        CLOUD_STORE_URL = `https://api.restful-api.dev/objects/${CLOUD_STORE_ID}`;
        localStorage.setItem(STORAGE_CLOUD_ID_KEY, CLOUD_STORE_ID);
        console.log('⚡ Created new Cloud Store Bucket:', CLOUD_STORE_ID);
      }
    }
  } catch (e) {
    console.warn('Failed to recreate cloud store:', e);
  }
};

/**
 * Save full data container to Cloud Storage
 */
const pushContainerToCloud = async (newData) => {
  try {
    currentCloudCache = { ...currentCloudCache, ...newData };
    const safeData = sanitizeForCloud(currentCloudCache);

    // Broadcast live event to open tabs/windows on device
    if (liveChannel) {
      try {
        liveChannel.postMessage({ type: 'DZONE_CLOUD_UPDATE', data: safeData });
      } catch (e) {}
    }

    // Save to Global Public Cloud REST API
    const res = await fetch(CLOUD_STORE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'DZONE_COLLECTION_SURAT_GLOBAL_STORE_V2',
        data: safeData
      })
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 500) {
        await recreateCloudStore();
        // Retry PUT with fresh bucket
        await fetch(CLOUD_STORE_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'DZONE_COLLECTION_SURAT_GLOBAL_STORE_V2',
            data: safeData
          })
        });
      }
    }
  } catch (err) {
    console.warn('Push to cloud warning:', err);
  }
};

// ----------------------------------------------------
// 1. PRODUCTS CLOUD SYNC
// ----------------------------------------------------
export const syncProductsToCloud = async (products) => {
  try {
    localStorage.setItem('dzone_products_v2', JSON.stringify(products));

    if (db) {
      try {
        const productsCol = collection(db, DB_COLLECTION_PRODUCTS);
        for (const prod of products) {
          if (prod && prod.id) {
            await setDoc(doc(productsCol, String(prod.id)), prod, { merge: true });
          }
        }
      } catch (e) {}
    }

    await pushContainerToCloud({ products });
    window.dispatchEvent(new CustomEvent('dzone_cloud_update', { detail: { type: 'products', data: products } }));
  } catch (err) {
    console.warn('Cloud product sync warning:', err);
  }
};

export const fetchCloudProducts = async () => {
  const data = await fetchFullCloudData();
  return data?.products || null;
};

// ----------------------------------------------------
// 2. HOMEPAGE MEDIA BANNERS CLOUD SYNC
// ----------------------------------------------------
export const syncMediaToCloud = async (media) => {
  try {
    localStorage.setItem('dzone_homepage_media_v1', JSON.stringify(media));

    if (db) {
      try {
        await setDoc(doc(db, DB_COLLECTION_MEDIA, 'main_banner'), media, { merge: true });
      } catch (e) {}
    }

    await pushContainerToCloud({ media });
    window.dispatchEvent(new CustomEvent('dzone_cloud_update', { detail: { type: 'media', data: media } }));
  } catch (err) {
    console.warn('Cloud media sync warning:', err);
  }
};

export const fetchCloudMedia = async () => {
  const data = await fetchFullCloudData();
  return data?.media || null;
};

// ----------------------------------------------------
// 3. REVIEWS CLOUD SYNC
// ----------------------------------------------------
export const syncReviewsToCloud = async (reviews) => {
  try {
    localStorage.setItem('dzone_reviews_v1', JSON.stringify(reviews));

    if (db) {
      try {
        const reviewsCol = collection(db, DB_COLLECTION_REVIEWS);
        for (const rev of reviews) {
          if (rev && rev.id) {
            await setDoc(doc(reviewsCol, String(rev.id)), rev, { merge: true });
          }
        }
      } catch (e) {}
    }

    await pushContainerToCloud({ reviews });
    window.dispatchEvent(new CustomEvent('dzone_cloud_update', { detail: { type: 'reviews', data: reviews } }));
  } catch (err) {
    console.warn('Cloud reviews sync warning:', err);
  }
};

// ----------------------------------------------------
// 4. ORDERS CLOUD SYNC
// ----------------------------------------------------
export const syncOrdersToCloud = async (orders) => {
  try {
    localStorage.setItem('dzone_orders_v1', JSON.stringify(orders));

    if (db) {
      try {
        const ordersCol = collection(db, DB_COLLECTION_ORDERS);
        for (const ord of orders) {
          if (ord && ord.id) {
            await setDoc(doc(ordersCol, String(ord.id)), ord, { merge: true });
          }
        }
      } catch (e) {}
    }

    await pushContainerToCloud({ orders });
    window.dispatchEvent(new CustomEvent('dzone_cloud_update', { detail: { type: 'orders', data: orders } }));
  } catch (err) {
    console.warn('Cloud orders sync warning:', err);
  }
};
