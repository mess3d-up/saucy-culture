import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAbandonedCartPitch,
  buildRestockPitch,
  buildUpiPaymentUri,
  calculateAuthoritativeTotals,
  findRestockedWishlistItems,
  formatINR,
  generateOrderNumber,
  generateTrackingToken,
  getOrderTimelineStep,
  normalizeTrackingToken,
  slugifyProductName,
  validateCheckoutInput,
  validateLeadContact,
  validatePushEndpointUrl,
} from './commerce';
import type { Product, StoreSettings } from '../types/store';

const sampleSettings: StoreSettings = {
  upiId: 'saucyculture@okaxis',
  upiMerchantName: 'SAUCY CULTURE',
  freeShippingThresholdINR: 1999,
  shippingFeeINR: 149,
  vipPromoCode: 'SAUCYVIP10',
  vipDiscountPercent: 10,
  announcementText: 'ALL-STAR DROP LIVE',
  heroTitle: 'THE NEW HOOP ERA',
  heroSubtitle: 'BASKETBALL × STREETWEAR · ALL-STAR DROP',
  maintenanceMode: false,
  supportWhatsapp: '919876543210',
  supportEmail: 'drop@saucyculture.in',
};

const sampleCatalog: Product[] = [
  {
    id: 'camo-jersey',
    slug: 'camo-jersey',
    name: "'99 All-Star Camo Jersey",
    category: 'Jerseys',
    collection: 'All-Star Drop',
    priceINR: 1899,
    spec: '260 GSM mesh',
    description: 'Heavy mesh jersey',
    image: '/img.jpg',
    gallery: [],
    stockBySize: { S: 5, M: 5, L: 3, XL: 2, XXL: 0 },
    featured: true,
    active: true,
  },
];

test('authoritative checkout ignores tampered client price and applies shipping under threshold', () => {
  const result = calculateAuthoritativeTotals(
    [{ productId: 'camo-jersey', name: 'Tampered', image: '/img.jpg', size: 'L', qty: 1, priceINR: 1 }],
    sampleCatalog,
    sampleSettings,
    ''
  );
  assert.equal(result.subtotalINR, 1899);
  assert.equal(result.shippingINR, 149);
  assert.equal(result.totalINR, 2048);
  assert.equal(result.freeShippingUnlocked, false);
});

test('VIP promo code SAUCYVIP10 applies 10% discount and unlocks free shipping when net >= 1999', () => {
  const result = calculateAuthoritativeTotals(
    [{ productId: 'camo-jersey', name: 'Jersey', image: '/img.jpg', size: 'M', qty: 2, priceINR: 1899 }],
    sampleCatalog,
    sampleSettings,
    'saucyvip10'
  );
  assert.equal(result.subtotalINR, 3798);
  assert.equal(result.discountINR, 380);
  assert.equal(result.shippingINR, 0);
  assert.equal(result.totalINR, 3418);
  assert.equal(result.appliedPromoCode, 'SAUCYVIP10');
});

test('duplicate product/size lines in one cart are aggregated before stock check', () => {
  // Size L has 3 units; two separate lines requesting 2 + 2 = 4 must fail
  assert.throws(() => {
    calculateAuthoritativeTotals(
      [
        { productId: 'camo-jersey', name: 'Jersey', image: '/img.jpg', size: 'L', qty: 2, priceINR: 1899 },
        { productId: 'camo-jersey', name: 'Jersey', image: '/img.jpg', size: 'L', qty: 2, priceINR: 1899 },
      ],
      sampleCatalog,
      sampleSettings,
      ''
    );
  }, /Only 3 unit/);

  // Two separate lines requesting 2 + 1 = 3 succeed and merge into one line of qty 3
  const merged = calculateAuthoritativeTotals(
    [
      { productId: 'camo-jersey', name: 'Jersey', image: '/img.jpg', size: 'L', qty: 2, priceINR: 1899 },
      { productId: 'camo-jersey', name: 'Jersey', image: '/img.jpg', size: 'L', qty: 1, priceINR: 1899 },
    ],
    sampleCatalog,
    sampleSettings,
    ''
  );
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].qty, 3);
  assert.equal(merged.subtotalINR, 5697);
});

test('stock guard rejects order exceeding per-size stock', () => {
  assert.throws(() => {
    calculateAuthoritativeTotals(
      [{ productId: 'camo-jersey', name: 'Jersey', image: '/img.jpg', size: 'XXL', qty: 1, priceINR: 1899 }],
      sampleCatalog,
      sampleSettings,
      ''
    );
  }, /Only 0 unit/);
});

test('validateCheckoutInput enforces Indian phone, pincode, and UPI UTR for UPI_DIRECT', () => {
  assert.match(
    validateCheckoutInput({
      customerName: 'Aarav',
      customerPhone: '1234567890',
      shippingAddr: '21 MG Road Indiranagar',
      city: 'Bengaluru',
      pincode: '560038',
      paymentMethod: 'COD',
      upiRef: '',
    }) ?? '',
    /10-digit Indian mobile/
  );

  assert.match(
    validateCheckoutInput({
      customerName: 'Aarav',
      customerPhone: '9876543210',
      shippingAddr: '21 MG Road Indiranagar',
      city: 'Bengaluru',
      pincode: '560038',
      paymentMethod: 'UPI_DIRECT',
      upiRef: '123',
    }) ?? '',
    /UPI UTR/
  );

  assert.equal(
    validateCheckoutInput({
      customerName: 'Aarav',
      customerPhone: '9876543210',
      shippingAddr: '21 MG Road Indiranagar',
      city: 'Bengaluru',
      pincode: '560038',
      paymentMethod: 'UPI_DIRECT',
      upiRef: '432198765432',
    }),
    null
  );
});

test('UPI payment URI, high-entropy order number, tracking token, slug, timeline, and INR formatting work', () => {
  const uri = buildUpiPaymentUri({
    upiId: 'saucy@upi',
    merchantName: 'SAUCY CULTURE',
    amountINR: 2499,
    orderRef: 'SC-IN-7K9P2M4Q8X',
  });
  assert.ok(uri.startsWith('upi://pay?'));
  assert.ok(uri.includes('pa=saucy%40upi'));
  assert.ok(uri.includes('am=2499'));
  assert.ok(uri.includes('cu=INR'));

  const orderNo = generateOrderNumber();
  assert.match(orderNo, /^SC-IN-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
  assert.equal(generateOrderNumber(() => 0), 'SC-IN-AAAAAAAAAA');

  const token = generateTrackingToken();
  assert.match(token, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normalizeTrackingToken(' abcd-efgh-2345 '), 'ABCDEFGH2345');

  assert.equal(slugifyProductName("'99 Camo Jersey!"), '99-camo-jersey');
  assert.equal(getOrderTimelineStep('DISPATCHED'), 4);
  assert.ok(formatINR(1899).includes('1,899'));
});

test('validateLeadContact accepts Indian WhatsApp and email, rejecting invalid strings', () => {
  const wa = validateLeadContact('9876543210');
  assert.equal(wa.valid, true);
  if (wa.valid) {
    assert.equal(wa.channel, 'WHATSAPP');
    assert.equal(wa.normalized, '9876543210');
  }

  const mail = validateLeadContact('Baller@Saucy.IN');
  assert.equal(mail.valid, true);
  if (mail.valid) {
    assert.equal(mail.channel, 'EMAIL');
    assert.equal(mail.normalized, 'baller@saucy.in');
  }

  assert.equal(validateLeadContact('12345').valid, false);
});

test('validatePushEndpointUrl prevents SSRF by restricting to HTTPS Web Push providers', () => {
  assert.equal(
    validatePushEndpointUrl('https://fcm.googleapis.com/fcm/send/abc123').hostname,
    'fcm.googleapis.com'
  );
  assert.equal(
    validatePushEndpointUrl('https://updates.push.services.mozilla.com/wpush/v2/xyz').hostname,
    'updates.push.services.mozilla.com'
  );
  assert.throws(() => validatePushEndpointUrl('http://fcm.googleapis.com/fcm/send/abc'), /HTTPS/);
  assert.throws(() => validatePushEndpointUrl('https://127.0.0.1/admin'), /Invalid push service host/);
  assert.throws(() => validatePushEndpointUrl('https://localhost:3000/hook'), /credentials or non-standard ports|Invalid push service host/);
  assert.throws(() => validatePushEndpointUrl('https://evil.com/steal-vapid'), /Unsupported Web Push/);
  assert.throws(
    () => validatePushEndpointUrl('https://user:pass@fcm.googleapis.com/fcm/send/abc'),
    /credentials/
  );
});

test('findRestockedWishlistItems detects wishlisted out-of-stock sizes now in stock and builds hype pitches', () => {
  const matches = findRestockedWishlistItems(
    [
      {
        productId: 'camo-jersey',
        name: "'99 All-Star Camo Jersey",
        image: '/img.jpg',
        size: 'L',
        priceINR: 1899,
        addedAt: 1,
        wasOutOfStock: true,
      },
      {
        productId: 'camo-jersey',
        name: "'99 All-Star Camo Jersey",
        image: '/img.jpg',
        size: 'XXL',
        priceINR: 1899,
        addedAt: 1,
        wasOutOfStock: true,
      },
    ],
    sampleCatalog
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].size, 'L');

  const cartPitch = buildAbandonedCartPitch({
    items: [
      {
        productId: 'camo-jersey',
        name: "'99 All-Star Camo Jersey",
        image: '/img.jpg',
        size: 'L',
        qty: 1,
        priceINR: 1899,
      },
    ],
    promoCode: 'SAUCYVIP10',
    discountPercent: 10,
  });
  assert.ok(cartPitch.title.includes('10% OFF'));
  assert.ok(cartPitch.body.includes("'99 All-Star Camo Jersey"));

  const restockPitch = buildRestockPitch({
    productName: "'99 All-Star Camo Jersey",
    size: 'L',
    promoCode: 'SAUCYVIP10',
    discountPercent: 10,
  });
  assert.ok(restockPitch.title.includes('BACK IN STOCK'));
});
