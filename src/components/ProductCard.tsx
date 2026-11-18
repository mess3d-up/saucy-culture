import React, { useState } from 'react';
import { BellRing, Heart } from 'lucide-react';
import { APPAREL_SIZES, type ApparelSize, type Product } from '../types/store';
import { formatINR, getSizeStock, getTotalStock } from '../utils/commerce';

interface ProductCardProps {
  product: Product;
  isWishlisted: boolean;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, size: ApparelSize) => void;
  onToggleWishlist: (product: Product, size: ApparelSize) => void;
  onWishlistOutOfStock: (product: Product, size: ApparelSize) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isWishlisted,
  onSelectProduct,
  onAddToCart,
  onToggleWishlist,
  onWishlistOutOfStock,
}) => {
  const firstAvailableSize =
    APPAREL_SIZES.find((sz) => getSizeStock(product, sz) > 0) ?? 'L';
  const [selectedSize, setSelectedSize] = useState<ApparelSize>(firstAvailableSize);
  const [justAdded, setJustAdded] = useState(false);

  const totalStock = getTotalStock(product);
  const currentSizeStock = getSizeStock(product, selectedSize);
  const isOutOfStock = totalStock <= 0 || currentSizeStock <= 0;

  const handleQuickAdd = () => {
    if (isOutOfStock) {
      onWishlistOutOfStock(product, selectedSize);
      return;
    }
    onAddToCart(product, selectedSize);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1100);
  };

  const isWhiteCollage =
    product.image.includes('70908_66d25331') ||
    product.image.includes('71010_d3fb3663') ||
    product.image.includes('70914_6ab085cd');
  const isPortraitModel =
    product.image.includes('70998_ee7af414') ||
    product.image.includes('70995_ef6c6085') ||
    product.image.includes('70992_91676d8f');

  return (
    <article
      data-testid={`product-card-${product.slug}`}
      className="group bg-white flex flex-col justify-between transition-all duration-200"
    >
      {/* Minimal Studio Image Stage */}
      <div>
        <div
          className={`relative aspect-[4/4.2] w-full rounded-lg overflow-hidden border border-neutral-200/80 group-hover:border-neutral-400 transition-colors ${
            isWhiteCollage ? 'bg-white' : 'bg-[#f7f7f7]'
          }`}
        >
          <button
            type="button"
            onClick={() => onSelectProduct(product)}
            aria-label={`View details for ${product.name}`}
            className="w-full h-full block text-left cursor-pointer"
          >
            <img
              src={product.image}
              alt={product.name}
              referrerPolicy="no-referrer"
              className={`w-full h-full transition-transform duration-300 group-hover:scale-[1.03] ${
                isWhiteCollage
                  ? 'object-contain p-2'
                  : isPortraitModel
                  ? 'object-cover object-[center_18%]'
                  : 'object-cover object-center'
              }`}
            />
          </button>

          {/* Top-right Wishlist Heart Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist(product, selectedSize);
            }}
            aria-label={
              isWishlisted
                ? `Remove ${product.name} from wishlist`
                : `Save ${product.name} to wishlist`
            }
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 hover:bg-white border border-neutral-200 shadow-sm flex items-center justify-center transition-colors cursor-pointer"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                isWishlisted ? 'text-[#e0531f] fill-[#e0531f]' : 'text-neutral-700'
              }`}
            />
          </button>

          {totalStock <= 0 && (
            <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded bg-[#111111] text-white text-[10px] font-bold uppercase tracking-wider">
              Sold Out
            </span>
          )}
        </div>

        {/* Clean Minimal Info Below Image (matching reference gallery) */}
        <div className="pt-3.5 space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <span className="whitespace-nowrap">{product.category}</span>
            {product.badge && (
              <span className="text-[#e0531f] whitespace-nowrap shrink-0">{product.badge}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelectProduct(product)}
            className="block w-full text-center sm:text-left cursor-pointer"
          >
            <h3 className="text-[15px] font-bold text-[#111111] group-hover:text-[#e0531f] transition-colors leading-snug line-clamp-1">
              {product.name}
            </h3>
          </button>

          <div className="flex items-baseline justify-center sm:justify-start gap-2 tabular-nums">
            <span className="text-sm font-semibold text-[#111111]">
              {formatINR(product.priceINR)}
            </span>
            {product.compareAtINR && product.compareAtINR > product.priceINR && (
              <span className="text-xs text-neutral-400 line-through">
                {formatINR(product.compareAtINR)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Size Picker + Quick Add / Wishlist Notify */}
      <div className="mt-3.5 space-y-2.5">
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={`Select size for ${product.name}`}
        >
          {APPAREL_SIZES.map((sz) => {
            const stock = getSizeStock(product, sz);
            const isSelected = selectedSize === sz;
            const soldOutSize = stock <= 0;
            return (
              <button
                key={sz}
                type="button"
                onClick={() => setSelectedSize(sz)}
                aria-label={soldOutSize ? `${sz} (Sold Out - Click to Notify)` : `Size ${sz}`}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded border transition-colors whitespace-nowrap cursor-pointer ${
                  soldOutSize && isSelected
                    ? 'bg-orange-50 border-[#e0531f] text-[#e0531f] line-through'
                    : soldOutSize
                    ? 'bg-neutral-100 border-neutral-200 text-neutral-400 line-through hover:border-neutral-400'
                    : isSelected
                    ? 'bg-[#111111] border-[#111111] text-white'
                    : 'bg-white border-neutral-200 text-neutral-700 hover:border-[#111111]'
                }`}
              >
                {sz}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleQuickAdd}
          className={`w-full py-2.5 px-3 rounded text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer inline-flex items-center justify-center gap-1.5 ${
            isOutOfStock
              ? 'bg-white border border-[#111111] text-[#111111] hover:bg-[#111111] hover:text-white'
              : justAdded
              ? 'bg-emerald-700 text-white'
              : 'bg-[#111111] hover:bg-[#e0531f] text-white'
          }`}
        >
          {isOutOfStock ? (
            <>
              <BellRing className="w-3.5 h-3.5 text-[#e0531f]" />
              Add to Wishlist · Notify Me
            </>
          ) : justAdded ? (
            `Added (${selectedSize})`
          ) : (
            'Add to Bag'
          )}
        </button>
      </div>
    </article>
  );
};
