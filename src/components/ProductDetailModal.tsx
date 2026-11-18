import React, { useEffect, useState } from 'react';
import { BellRing, Heart, Ruler, ShieldCheck, Truck, X } from 'lucide-react';
import { APPAREL_SIZES, type ApparelSize, type Product } from '../types/store';
import { formatINR, getSizeStock } from '../utils/commerce';

interface ProductDetailModalProps {
  product: Product | null;
  freeShippingThresholdINR: number;
  isWishlisted: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, size: ApparelSize) => void;
  onToggleWishlist: (product: Product, size: ApparelSize) => void;
  onWishlistOutOfStock: (product: Product, size: ApparelSize) => void;
  onJumpToSizeChart: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  freeShippingThresholdINR,
  isWishlisted,
  onClose,
  onAddToCart,
  onToggleWishlist,
  onWishlistOutOfStock,
  onJumpToSizeChart,
}) => {
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [selectedSize, setSelectedSize] = useState<ApparelSize>('L');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!product) return;
    setSelectedImageIdx(0);
    setAdded(false);
    const firstAvailable = APPAREL_SIZES.find((sz) => getSizeStock(product, sz) > 0) ?? 'L';
    setSelectedSize(firstAvailable);
  }, [product?.id]);

  if (!product) return null;

  const images = Array.from(new Set([product.image, ...(product.gallery || [])])).filter(Boolean);
  const activeImg = images[selectedImageIdx] ?? product.image;
  const sizeStock = getSizeStock(product, selectedSize);
  const isOutOfStock = sizeStock <= 0;

  const handlePrimaryAction = () => {
    if (isOutOfStock) {
      onClose();
      onWishlistOutOfStock(product, selectedSize);
      return;
    }
    onAddToCart(product, selectedSize);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div className="bg-white border border-neutral-200 rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl my-auto text-[#111111]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 bg-neutral-50">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            {product.category} · {product.collection}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleWishlist(product, selectedSize)}
              aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              className="p-1.5 rounded hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
            >
              <Heart
                className={`w-5 h-5 ${
                  isWishlisted ? 'text-[#e0531f] fill-[#e0531f]' : 'text-neutral-700'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close product details"
              className="p-1.5 rounded hover:bg-neutral-200 text-neutral-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Left Minimal Studio Gallery */}
          <div className="md:col-span-7 bg-[#f7f7f7] p-4 sm:p-6 flex flex-col gap-3">
            <div className="aspect-[4/3.6] w-full rounded-lg overflow-hidden bg-white border border-neutral-200">
              <img
                src={activeImg}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain p-2"
              />
            </div>

            {images.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {images.slice(0, 5).map((imgUrl, idx) => (
                  <button
                    key={imgUrl + idx}
                    type="button"
                    onClick={() => setSelectedImageIdx(idx)}
                    aria-label={`View image ${idx + 1}`}
                    className={`aspect-square rounded overflow-hidden border bg-white transition-colors cursor-pointer ${
                      idx === selectedImageIdx
                        ? 'border-[#111111]'
                        : 'border-neutral-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt={`${product.name} angle ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Purchase Column */}
          <div className="md:col-span-5 p-5 sm:p-6 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              {product.badge && (
                <p className="text-xs font-bold uppercase tracking-wider text-[#e0531f]">
                  {product.badge}
                </p>
              )}

              <h2 className="font-display text-3xl uppercase text-[#111111] leading-none">
                {product.name}
              </h2>

              <div className="flex items-baseline gap-3 tabular-nums">
                <span className="text-2xl font-bold text-[#111111]">
                  {formatINR(product.priceINR)}
                </span>
                {product.compareAtINR && product.compareAtINR > product.priceINR && (
                  <span className="text-sm text-neutral-400 line-through">
                    {formatINR(product.compareAtINR)}
                  </span>
                )}
              </div>

              <p className="text-sm text-neutral-700 leading-relaxed">{product.description}</p>
              <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-200">
                {product.spec}
              </p>

              {/* Clickable Size Selector (including sold-out sizes for Restock Wishlist) */}
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-[#111111]">
                    Size ·{' '}
                    <span className="text-neutral-500 font-normal tabular-nums">
                      {sizeStock > 0 ? `${sizeStock} in stock` : 'Sold out — tap Notify Me'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onJumpToSizeChart();
                    }}
                    className="inline-flex items-center gap-1 text-[#e0531f] hover:underline font-semibold cursor-pointer"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    Size Guide
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {APPAREL_SIZES.map((sz) => {
                    const qty = getSizeStock(product, sz);
                    const active = selectedSize === sz;
                    const soldOut = qty <= 0;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setSelectedSize(sz)}
                        className={`py-2 text-xs font-bold rounded border transition-colors cursor-pointer ${
                          soldOut && active
                            ? 'bg-orange-50 border-[#e0531f] text-[#e0531f] line-through'
                            : soldOut
                            ? 'bg-neutral-100 border-neutral-200 text-neutral-400 line-through hover:border-neutral-400'
                            : active
                            ? 'bg-[#111111] border-[#111111] text-white'
                            : 'bg-white border-neutral-200 text-neutral-800 hover:border-[#111111]'
                        }`}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handlePrimaryAction}
                className={`w-full py-3.5 px-6 rounded font-bold text-xs sm:text-sm uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center justify-center gap-2 ${
                  isOutOfStock
                    ? 'bg-white border-2 border-[#111111] text-[#111111] hover:bg-[#111111] hover:text-white'
                    : added
                    ? 'bg-emerald-700 text-white'
                    : 'bg-[#111111] hover:bg-[#e0531f] text-white'
                }`}
              >
                {isOutOfStock ? (
                  <>
                    <BellRing className="w-4 h-4 text-[#e0531f]" />
                    Add to Wishlist · Notify Back in Stock
                  </>
                ) : added ? (
                  `Added ${selectedSize} to Bag`
                ) : (
                  `Add to Bag · ${formatINR(product.priceINR)}`
                )}
              </button>

              <div className="flex flex-col gap-1.5 text-[11px] text-neutral-600">
                <span className="inline-flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-[#e0531f]" />
                  Free pan-India delivery above {formatINR(freeShippingThresholdINR)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#e0531f]" />
                  Cash on Delivery &amp; 0%-fee Direct UPI accepted
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
