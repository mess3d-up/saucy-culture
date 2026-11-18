import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  ArrowLeft,
  BellRing,
  Check,
  Download,
  History,
  ImagePlus,
  Lock,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { UPLOADED_IMAGE_LIBRARY } from '../data/catalog';
import {
  addAdminEmail,
  checkAdminIdentity,
  deleteProductAdmin,
  fetchAdminDashboard,
  fetchAuditLogsAdmin,
  pruneAuditLogsOwnerAdmin,
  releaseExpiredOrdersAdmin,
  removeAdminEmail,
  saveProductAdmin,
  seedInitialCatalogIfEmpty,
  sendPushBlastAdmin,
  updateCartLeadStatusAdmin,
  updateOrderStatusAdmin,
  updateRestockAlertStatusAdmin,
  updateStoreSettingsAdmin,
  uploadProductImageCloudinary,
} from '../lib/api';
import { auth, signInWithGoogle, signOutUser, SUPER_ADMIN_EMAIL } from '../lib/firebase';
import {
  APPAREL_CATEGORIES,
  APPAREL_SIZES,
  type AdminAccess,
  type ApparelCategory,
  type AuditLogEntry,
  type AuditVerificationResult,
  type CartLead,
  type CircleMember,
  type Order,
  type OrderStatus,
  type Product,
  type RestockAlert,
  type StockBySize,
  type StoreSettings,
} from '../types/store';
import {
  buildOrdersCsv,
  buildRestockPitch,
  formatINR,
  getOrderStatusLabel,
  getTotalStock,
  slugifyProductName,
} from '../utils/commerce';

interface AdminDashboardProps {
  products: Product[];
  settings: StoreSettings;
  onCatalogOrSettingsChanged: () => void;
  onExitAdmin: () => void;
}

type AdminTab = 'orders' | 'products' | 'circle' | 'leads' | 'settings' | 'audit';

const EMPTY_STOCK: StockBySize = { S: 10, M: 10, L: 10, XL: 10, XXL: 5 };

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  products: initialProducts,
  settings: initialSettings,
  onCatalogOrSettingsChanged,
  onExitAdmin,
}) => {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState<AdminTab>('orders');
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [orders, setOrders] = useState<Order[]>([]);
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([]);
  const [cartLeads, setCartLeads] = useState<CartLead[]>([]);
  const [restockAlerts, setRestockAlerts] = useState<RestockAlert[]>([]);
  const [adminList, setAdminList] = useState<AdminAccess[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditVerification, setAuditVerification] = useState<AuditVerificationResult | null>(null);

  const [pushSubscriberCount, setPushSubscriberCount] = useState(0);
  const [cloudinaryConfigured, setCloudinaryConfigured] = useState(false);
  const [webPushConfigured, setWebPushConfigured] = useState(false);
  const [storageMode, setStorageMode] = useState<'postgres' | 'local-json'>('local-json');

  const [statusNotice, setStatusNotice] = useState('');

  // Order filter & dispatch draft
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'DISPATCHED'>('ALL');
  const [courierDrafts, setCourierDrafts] = useState<Record<string, { courier: string; tracking: string }>>({});

  // Product Form state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState<ApparelCategory>('Tees');
  const [prodCollection, setProdCollection] = useState('All-Star Drop');
  const [prodPrice, setProdPrice] = useState('1699');
  const [prodCompareAt, setProdCompareAt] = useState('2199');
  const [prodBadge, setProdBadge] = useState('');
  const [prodSpec, setProdSpec] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImage, setProdImage] = useState(UPLOADED_IMAGE_LIBRARY[0].path);
  const [prodGalleryText, setProdGalleryText] = useState('');
  const [prodStock, setProdStock] = useState<StockBySize>({ ...EMPTY_STOCK });
  const [prodFeatured, setProdFeatured] = useState(true);
  const [prodActive, setProdActive] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Push Blast state
  const [blastTopic, setBlastTopic] = useState<'ALL' | 'CART_ABANDON' | 'RESTOCK'>('CART_ABANDON');
  const [blastTitle, setBlastTitle] = useState(
    `LOCK ${initialSettings.vipDiscountPercent}% OFF BEFORE YOUR SIZE VANISHES`
  );
  const [blastBody, setBlastBody] = useState(
    `Your Saucy Culture bag is waiting — apply ${initialSettings.vipPromoCode} right now!`
  );
  const [sendingBlast, setSendingBlast] = useState(false);

  // Settings & Team Form state
  const [settingsForm, setSettingsForm] = useState<StoreSettings>(initialSettings);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  // Audit prune confirmation
  const [confirmAuditAction, setConfirmAuditAction] = useState<'KEEP_RECENT' | 'CLEAR_ALL' | null>(null);

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => setStatusNotice(''), 4000);
  };

  const refreshAdminData = useCallback(async () => {
    const [dash, audit] = await Promise.all([fetchAdminDashboard(), fetchAuditLogsAdmin()]);
    setProducts(dash.products);
    setSettings(dash.settings);
    setSettingsForm(dash.settings);
    setOrders(dash.orders);
    setCircleMembers(dash.circleMembers);
    setCartLeads(dash.cartLeads);
    setRestockAlerts(dash.restockAlerts);
    setAdminList(dash.admins);
    setPushSubscriberCount(dash.pushSubscriberCount);
    setCloudinaryConfigured(dash.cloudinaryConfigured);
    setWebPushConfigured(dash.webPushConfigured);
    setStorageMode(dash.storageMode);
    setIsOwner(dash.isOwner);
    setAuditLogs(audit.logs);
    setAuditVerification(audit.verification);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthError('');
      if (!nextUser) {
        setIsAuthorized(false);
        setIsOwner(false);
        setAuthChecking(false);
        return;
      }
      try {
        const identity = await checkAdminIdentity();
        setIsAuthorized(true);
        setIsOwner(identity.isOwner);
        await refreshAdminData();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Authorization check failed.');
        setIsAuthorized(false);
      } finally {
        setAuthChecking(false);
      }
    });
    return () => unsub();
  }, [refreshAdminData]);

  const resetProductForm = () => {
    setEditingProductId(null);
    setProdName('');
    setProdCategory('Tees');
    setProdCollection('All-Star Drop');
    setProdPrice('1699');
    setProdCompareAt('2199');
    setProdBadge('');
    setProdSpec('');
    setProdDesc('');
    setProdImage(UPLOADED_IMAGE_LIBRARY[0].path);
    setProdGalleryText('');
    setProdStock({ ...EMPTY_STOCK });
    setProdFeatured(true);
    setProdActive(true);
  };

  const loadProductIntoEditor = (p: Product) => {
    setEditingProductId(p.id);
    setProdName(p.name);
    setProdCategory(p.category);
    setProdCollection(p.collection);
    setProdPrice(String(p.priceINR));
    setProdCompareAt(p.compareAtINR ? String(p.compareAtINR) : '');
    setProdBadge(p.badge ?? '');
    setProdSpec(p.spec);
    setProdDesc(p.description);
    setProdImage(p.image);
    setProdGalleryText((p.gallery || []).join('\n'));
    setProdStock({ ...p.stockBySize });
    setProdFeatured(p.featured);
    setProdActive(p.active);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrimaryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingImage(true);
    try {
      const secureUrl = await uploadProductImageCloudinary(file);
      setProdImage(secureUrl);
      showNotice('Primary photo uploaded directly to Cloudinary.');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadingImage(true);
    try {
      const urls: string[] = [];
      for (const f of files.slice(0, 6)) {
        urls.push(await uploadProductImageCloudinary(f));
      }
      setProdGalleryText((prev) =>
        [prev.trim(), ...urls].filter((line) => line.length > 0).join('\n')
      );
      showNotice(`Uploaded ${urls.length} gallery photo(s) to Cloudinary.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Gallery upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = prodName.trim();
    const cleanCollection = prodCollection.trim() || 'All-Star Drop';
    const cleanSpec = prodSpec.trim() || '280 GSM heavyweight cotton · Relaxed fit';
    const cleanDesc = prodDesc.trim() || 'Saucy Culture limited drop garment.';
    const cleanImage = prodImage.trim() || UPLOADED_IMAGE_LIBRARY[0].path;
    const priceNum = Number(prodPrice);
    const compareNum = prodCompareAt.trim() ? Number(prodCompareAt) : undefined;

    if (cleanName.length < 2 || cleanName.length > 100) {
      showNotice('Product name must be between 2 and 100 characters.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 1 || priceNum > 500000) {
      showNotice('INR price must be between ₹1 and ₹5,00,000.');
      return;
    }
    if (compareNum !== undefined && (!Number.isFinite(compareNum) || compareNum > 500000)) {
      showNotice('Compare MRP must be ₹5,00,000 or less.');
      return;
    }
    if (cleanImage.startsWith('data:') || cleanImage.length > 2000) {
      showNotice('Upload via Cloudinary or enter an image URL under 2,000 characters.');
      return;
    }

    const isNew = !editingProductId;
    const rawSlug = slugifyProductName(cleanName).slice(0, 70);
    const slugBase = rawSlug.length >= 2 ? rawSlug : `${rawSlug || 'sc'}-drop`;
    const productId =
      editingProductId ?? `${slugBase.slice(0, 60)}-${Date.now().toString(36).slice(-4)}`;
    const galleryList = prodGalleryText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('data:') && s.length <= 2000)
      .slice(0, 8);

    setSavingProduct(true);
    try {
      const res = await saveProductAdmin(
        {
          id: productId,
          slug: slugBase,
          name: cleanName,
          category: prodCategory,
          collection: cleanCollection.slice(0, 60),
          priceINR: Math.round(priceNum),
          compareAtINR:
            compareNum && Number.isFinite(compareNum) && compareNum >= Math.round(priceNum)
              ? Math.round(compareNum)
              : undefined,
          badge: prodBadge.trim().slice(0, 30) || undefined,
          spec: cleanSpec.slice(0, 220),
          description: cleanDesc.slice(0, 800),
          image: cleanImage,
          gallery: galleryList,
          stockBySize: prodStock,
          featured: prodFeatured,
          active: prodActive,
        },
        isNew
      );
      await refreshAdminData();
      onCatalogOrSettingsChanged();
      const pushNote =
        res.restockedSizes.length > 0 && res.pushDispatch.sent > 0
          ? ` Sent ${res.pushDispatch.sent} background restock push alert(s)!`
          : '';
      showNotice(
        (isNew ? `Added "${cleanName}" to live catalog.` : `Updated "${cleanName}".`) + pushNote
      );
      resetProductForm();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleOrderTransition = async (order: Order, nextStatus: OrderStatus) => {
    const draft = courierDrafts[order.id];
    try {
      await updateOrderStatusAdmin({
        order,
        nextStatus,
        courierName: draft?.courier ?? order.courierName,
        trackingId: draft?.tracking ?? order.trackingId,
      });
      await refreshAdminData();
      onCatalogOrSettingsChanged();
      showNotice(`${order.orderNumber} updated to ${getOrderStatusLabel(nextStatus)}.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to update order.');
    }
  };

  const handleReleaseExpiredHolds = async () => {
    try {
      const res = await releaseExpiredOrdersAdmin();
      await refreshAdminData();
      onCatalogOrSettingsChanged();
      showNotice(
        res.releasedCount > 0
          ? `Released stock from ${res.releasedCount} expired hold order(s).`
          : 'No expired unpaid holds found.'
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to release holds.');
    }
  };

  const handleDownloadOrdersCsv = () => {
    const csv = buildOrdersCsv(orders);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `saucy-culture-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateStoreSettingsAdmin(settingsForm);
      await refreshAdminData();
      onCatalogOrSettingsChanged();
      showNotice('Storefront, Hero & UPI settings updated live.');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to save settings.');
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newAdminEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      showNotice('Enter a valid Google email address.');
      return;
    }
    try {
      await addAdminEmail(clean);
      setNewAdminEmail('');
      await refreshAdminData();
      showNotice(`Granted admin access to ${clean}.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to grant admin access.');
    }
  };

  const handleSendPushBlast = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingBlast(true);
    try {
      const res = await sendPushBlastAdmin({
        topic: blastTopic,
        title: blastTitle,
        body: blastBody,
        url: '/#shop',
      });
      await refreshAdminData();
      if (!res.configured) {
        showNotice(
          'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set yet. Action logged in Audit Log.'
        );
      } else {
        showNotice(`Dispatched browser push to ${res.sent} device(s) (${res.failed} failed).`);
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Push blast failed.');
    } finally {
      setSendingBlast(false);
    }
  };

  const handlePruneAuditLogs = async (mode: 'KEEP_RECENT' | 'CLEAR_ALL') => {
    try {
      const res = await pruneAuditLogsOwnerAdmin(mode);
      setConfirmAuditAction(null);
      await refreshAdminData();
      showNotice(`Owner pruned ${res.deletedCount} audit entry(s).`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Forbidden.');
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (orderFilter === 'PENDING') {
      return o.paymentStatus === 'PAYMENT_ON_HOLD' || o.paymentStatus === 'UPI_PENDING_VERIFY';
    }
    if (orderFilter === 'CONFIRMED') {
      return (
        o.paymentStatus === 'COD_CONFIRMED' ||
        o.paymentStatus === 'UPI_VERIFIED' ||
        o.paymentStatus === 'PACKED'
      );
    }
    if (orderFilter === 'DISPATCHED') {
      return o.paymentStatus === 'DISPATCHED' || o.paymentStatus === 'DELIVERED';
    }
    return true;
  });

  const totalRevenueINR = orders
    .filter((o) => o.paymentStatus !== 'CANCELLED')
    .reduce((sum, o) => sum + o.totalINR, 0);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#090b0a] text-[#f4efe6] flex items-center justify-center p-6">
        <p className="text-sm text-[#9eb0a5]">Verifying admin credentials...</p>
      </div>
    );
  }

  if (!user || !isAuthorized) {
    return (
      <div className="min-h-screen bg-[#090b0a] text-[#f4efe6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#121b16] border border-[#24332a] rounded-xl p-8 space-y-5">
          <button
            type="button"
            onClick={onExitAdmin}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#9eb0a5] hover:text-[#f4efe6]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Storefront
          </button>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-[#e0531f] text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              Protected Back Office
            </div>
            <h1 className="font-display text-4xl uppercase">SAUCY CULTURE ADMIN</h1>
            <p className="text-sm text-[#9eb0a5]">
              Sign in with an authorized Google account to manage orders, UPI verification,
              Cloudinary product drops, and tamper-evident audit logs.
            </p>
          </div>

          {user && !isAuthorized && (
            <div className="bg-[#090b0a] border border-[#ff6b6b]/50 rounded-lg p-3.5 text-xs text-[#ff6b6b] space-y-2">
              <p>
                Signed in as <strong>{user.email}</strong>, which is not yet on the Saucy Culture
                admin roster. Ask the owner ({SUPER_ADMIN_EMAIL}) to add your email under Team
                Access.
              </p>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="underline font-bold"
              >
                Switch Google Account
              </button>
            </div>
          )}

          {authError && <p className="text-xs text-[#ff6b6b]">{authError}</p>}

          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="w-full py-3.5 px-5 rounded bg-[#e0531f] hover:bg-[#c84617] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090b0a] text-[#f4efe6]">
      {/* Admin Top Header */}
      <header className="sticky top-0 z-30 bg-[#090b0a]/95 backdrop-blur border-b border-[#24332a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onExitAdmin}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#9eb0a5] hover:text-[#f4efe6] whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Storefront
            </button>
            <h1 className="font-display text-2xl uppercase text-[#f4efe6] whitespace-nowrap">
              SAUCY ADMIN
            </h1>
            <span className="hidden md:inline-block px-2 py-0.5 rounded bg-[#121b16] border border-[#24332a] text-[10px] font-bold uppercase tracking-wider text-[#9eb0a5]">
              {storageMode === 'postgres' ? 'PostgreSQL Live' : 'Preview Store'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-[#9eb0a5]">
              {user.email} ({isOwner ? 'OWNER' : 'ADMIN'})
            </span>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#121b16] border border-[#24332a] text-xs font-bold uppercase tracking-wider hover:border-[#e0531f] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
          <div className="bg-[#121b16] border border-[#24332a] rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-[#9eb0a5]">Total Revenue</p>
            <p className="font-display text-3xl text-[#f4efe6] mt-1">{formatINR(totalRevenueINR)}</p>
          </div>
          <div className="bg-[#121b16] border border-[#24332a] rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-[#9eb0a5]">Orders</p>
            <p className="font-display text-3xl text-[#f4efe6] mt-1">{orders.length}</p>
          </div>
          <div className="bg-[#121b16] border border-[#24332a] rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-[#9eb0a5]">Active Products</p>
            <p className="font-display text-3xl text-[#f4efe6] mt-1">
              {products.filter((p) => p.active).length}
            </p>
          </div>
          <div className="bg-[#121b16] border border-[#24332a] rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-[#9eb0a5]">Push Devices / VIPs</p>
            <p className="font-display text-3xl text-[#f4efe6] mt-1">
              {pushSubscriberCount} / {circleMembers.length}
            </p>
          </div>
        </div>

        {statusNotice && (
          <div className="bg-[#16231b] border border-[#e0531f] rounded-lg px-4 py-3 text-xs font-semibold text-[#f4efe6] flex items-center gap-2">
            <Check className="w-4 h-4 text-[#e0531f] shrink-0" />
            {statusNotice}
          </div>
        )}

        {/* Section Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#24332a] pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-[#e0531f] text-white'
                : 'bg-[#121b16] text-[#9eb0a5] hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            Orders ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'products'
                ? 'bg-[#e0531f] text-white'
                : 'bg-[#121b16] text-[#9eb0a5] hover:text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            Products &amp; Stock ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('circle')}
            className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'circle'
                ? 'bg-[#e0531f] text-white'
                : 'bg-[#121b16] text-[#9eb0a5] hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Our Circle VIP ({circleMembers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leads')}
            className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'leads'
                ? 'bg-[#e0531f] text-white'
                : 'bg-[#121b16] text-[#9eb0a5] hover:text-white'
            }`}
          >
            <BellRing className="w-4 h-4" />
            Leads &amp; Push ({cartLeads.length + restockAlerts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[#e0531f] text-white'
                : 'bg-[#121b16] text-[#9eb0a5] hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings &amp; Team
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-[#e0531f] text-white'
                : 'bg-[#121b16] text-[#9eb0a5] hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            Audit Log ({auditLogs.length})
          </button>
        </div>

        {/* TAB 1: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {(['ALL', 'PENDING', 'CONFIRMED', 'DISPATCHED'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setOrderFilter(f)}
                    className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider border cursor-pointer ${
                      orderFilter === f
                        ? 'bg-[#f4efe6] text-[#090b0a] border-[#f4efe6]'
                        : 'bg-[#121b16] text-[#9eb0a5] border-[#24332a]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleReleaseExpiredHolds()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#121b16] border border-[#24332a] text-xs font-bold uppercase tracking-wider hover:border-[#e0531f] cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Release Expired Holds
                </button>
                <button
                  type="button"
                  onClick={handleDownloadOrdersCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#121b16] border border-[#24332a] text-xs font-bold uppercase tracking-wider hover:border-[#e0531f] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-[#121b16] border border-[#24332a] rounded-xl p-10 text-center text-sm text-[#9eb0a5]">
                No orders match this filter yet.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => {
                  const draft = courierDrafts[order.id] ?? {
                    courier: order.courierName || 'Delhivery',
                    tracking: order.trackingId || '',
                  };
                  return (
                    <div
                      key={order.id}
                      className="bg-[#121b16] border border-[#24332a] rounded-xl p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="font-display text-2xl text-[#f4efe6]">
                              {order.orderNumber}
                            </h3>
                            <span className="text-xs font-bold uppercase tracking-wider text-[#e0531f]">
                              {getOrderStatusLabel(order.paymentStatus)}
                            </span>
                          </div>
                          <p className="text-xs text-[#d8e0db] mt-1">
                            {order.customerName} · +91 {order.customerPhone} ·{' '}
                            <a
                              href={`https://wa.me/91${order.customerPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#e0531f] underline"
                            >
                              WhatsApp
                            </a>
                          </p>
                          <p className="text-xs text-[#9eb0a5] mt-0.5">
                            {order.shippingAddr}, {order.city} — {order.pincode}
                          </p>
                          {order.trackingToken && (
                            <p className="text-[11px] text-[#9eb0a5] mt-0.5 font-mono">
                              Tracking Key: <span className="text-[#f4efe6]">{order.trackingToken}</span>
                            </p>
                          )}
                        </div>

                        <div className="text-right tabular-nums">
                          <p className="text-xl font-bold text-[#f4efe6]">
                            {formatINR(order.totalINR)}
                          </p>
                          <p className="text-xs text-[#9eb0a5]">
                            {order.paymentMethod === 'UPI_DIRECT'
                              ? `Direct UPI · UTR: ${order.upiRef}`
                              : 'Cash on Delivery'}
                          </p>
                          <p className="text-[11px] text-[#9eb0a5]">
                            {order.stockDeducted
                              ? order.reservedUntil
                                ? 'Inventory Reserved'
                                : 'Inventory Deducted'
                              : 'Inventory Released'}
                          </p>
                        </div>
                      </div>

                      <div className="bg-[#090b0a] border border-[#24332a] rounded-lg p-3 text-xs space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between tabular-nums">
                            <span>
                              {item.name} · Size {item.size} × {item.qty}
                            </span>
                            <span>{formatINR(item.priceINR * item.qty)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <input
                          type="text"
                          value={draft.courier}
                          onChange={(e) =>
                            setCourierDrafts((prev) => ({
                              ...prev,
                              [order.id]: { ...draft, courier: e.target.value },
                            }))
                          }
                          placeholder="Courier (Delhivery / Bluedart)"
                          className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6]"
                        />
                        <input
                          type="text"
                          value={draft.tracking}
                          onChange={(e) =>
                            setCourierDrafts((prev) => ({
                              ...prev,
                              [order.id]: { ...draft, tracking: e.target.value },
                            }))
                          }
                          placeholder="AWB / Tracking Code"
                          className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6] font-mono"
                        />

                        {order.paymentMethod === 'COD' &&
                          order.paymentStatus === 'PAYMENT_ON_HOLD' && (
                            <button
                              type="button"
                              onClick={() => void handleOrderTransition(order, 'COD_CONFIRMED')}
                              className="px-3 py-1.5 rounded bg-[#e0531f] text-white text-xs font-bold uppercase cursor-pointer"
                            >
                              Confirm COD Order
                            </button>
                          )}

                        {order.paymentMethod === 'UPI_DIRECT' &&
                          order.paymentStatus === 'UPI_PENDING_VERIFY' && (
                            <button
                              type="button"
                              onClick={() => void handleOrderTransition(order, 'UPI_VERIFIED')}
                              className="px-3 py-1.5 rounded bg-[#2a7b4c] text-white text-xs font-bold uppercase cursor-pointer"
                            >
                              Verify UPI Payment
                            </button>
                          )}

                        <button
                          type="button"
                          onClick={() => void handleOrderTransition(order, 'PACKED')}
                          className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs font-bold uppercase hover:border-[#f4efe6] cursor-pointer"
                        >
                          Mark Packed
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOrderTransition(order, 'DISPATCHED')}
                          className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#e0531f] text-[#e0531f] text-xs font-bold uppercase hover:bg-[#e0531f] hover:text-white cursor-pointer"
                        >
                          Mark Dispatched
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOrderTransition(order, 'DELIVERED')}
                          className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs font-bold uppercase hover:border-[#2ecc71] cursor-pointer"
                        >
                          Delivered
                        </button>
                        {order.paymentStatus !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => void handleOrderTransition(order, 'CANCELLED')}
                            className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs font-bold uppercase text-[#ff6b6b] hover:border-[#ff6b6b] cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PRODUCTS & CLOUDINARY UPLOAD CRUD */}
        {activeTab === 'products' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Add / Edit Product Form */}
            <form
              onSubmit={handleSaveProduct}
              className="lg:col-span-5 bg-[#121b16] border border-[#24332a] rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl uppercase">
                  {editingProductId ? 'Edit Product' : 'Add New Product'}
                </h2>
                {editingProductId && (
                  <button
                    type="button"
                    onClick={resetProductForm}
                    className="text-xs font-bold text-[#e0531f] hover:underline cursor-pointer"
                  >
                    + Create New Instead
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="e.g. '99 Court Cargo Hoodie"
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                      Category
                    </label>
                    <select
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value as ApparelCategory)}
                      className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                    >
                      {APPAREL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                      Collection
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={prodCollection}
                      onChange={(e) => setProdCollection(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                      Price (₹)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={500000}
                      value={prodPrice}
                      onChange={(e) => setProdPrice(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                      Compare MRP (₹)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500000}
                      value={prodCompareAt}
                      onChange={(e) => setProdCompareAt(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                      Badge
                    </label>
                    <input
                      type="text"
                      maxLength={30}
                      value={prodBadge}
                      onChange={(e) => setProdBadge(e.target.value)}
                      placeholder="New Drop"
                      className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                    />
                  </div>
                </div>

                {/* Cloudinary Direct Photo Upload + Shoot Library */}
                <div className="bg-[#090b0a] border border-[#24332a] rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase text-[#d8e0db]">
                      Product Photo Upload
                    </span>
                    <span className="text-[10px] font-bold uppercase text-[#9eb0a5]">
                      {cloudinaryConfigured ? 'Cloudinary Ready' : 'Set Cloudinary Env'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <img
                      src={prodImage}
                      alt="Product preview"
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded object-cover border border-[#24332a] bg-[#121b16] shrink-0"
                    />
                    <div className="flex-1 flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#e0531f] hover:bg-[#c84617] text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingImage ? 'Uploading...' : 'Upload Main Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingImage}
                          onChange={(e) => void handlePrimaryImageUpload(e)}
                          className="sr-only"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#121b16] border border-[#24332a] hover:border-[#e0531f] text-[#f4efe6] text-[11px] font-bold uppercase tracking-wider cursor-pointer">
                        <ImagePlus className="w-3.5 h-3.5" />
                        + Gallery Photos
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={uploadingImage}
                          onChange={(e) => void handleGalleryUpload(e)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  <select
                    value={UPLOADED_IMAGE_LIBRARY.some((i) => i.path === prodImage) ? prodImage : ''}
                    onChange={(e) => {
                      if (e.target.value) setProdImage(e.target.value);
                    }}
                    className="w-full px-3 py-2 rounded bg-[#121b16] border border-[#24332a] text-xs text-[#9eb0a5]"
                  >
                    <option value="">-- Or Choose From Saucy Culture Shoot Library --</option>
                    {UPLOADED_IMAGE_LIBRARY.map((img) => (
                      <option key={img.path} value={img.path}>
                        {img.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    required
                    maxLength={2000}
                    value={prodImage}
                    onChange={(e) => setProdImage(e.target.value)}
                    placeholder="https://res.cloudinary.com/... or /assets/aistudio/..."
                    className="w-full px-3 py-2 rounded bg-[#121b16] border border-[#24332a] text-xs text-[#f4efe6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Gallery Image URLs (one per line)
                  </label>
                  <textarea
                    rows={2}
                    value={prodGalleryText}
                    onChange={(e) => setProdGalleryText(e.target.value)}
                    placeholder="https://res.cloudinary.com/..."
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Fabric Spec
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={220}
                    value={prodSpec}
                    onChange={(e) => setProdSpec(e.target.value)}
                    placeholder="280 GSM cotton · Boxy fit"
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    required
                    maxLength={800}
                    value={prodDesc}
                    onChange={(e) => setProdDesc(e.target.value)}
                    placeholder="Garment construction & drop story..."
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6]"
                  />
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-[#d8e0db] mb-1.5">
                    Per-Size Inventory
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {APPAREL_SIZES.map((sz) => (
                      <div key={sz}>
                        <label className="block text-[10px] font-bold text-[#9eb0a5] mb-0.5">
                          {sz}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={prodStock[sz]}
                          onChange={(e) =>
                            setProdStock((prev) => ({
                              ...prev,
                              [sz]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6] tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodActive}
                      onChange={(e) => setProdActive(e.target.checked)}
                    />
                    Live in Storefront
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodFeatured}
                      onChange={(e) => setProdFeatured(e.target.checked)}
                    />
                    Featured Drop
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingProduct || uploadingImage}
                className="w-full py-3 rounded bg-[#e0531f] hover:bg-[#c84617] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                {savingProduct
                  ? 'Saving...'
                  : editingProductId
                  ? 'Save Product Changes'
                  : 'Publish New Product'}
              </button>
            </form>

            {/* Product List */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl uppercase">Live Catalog</h2>
                <button
                  type="button"
                  onClick={() =>
                    void seedInitialCatalogIfEmpty().then(async (r) => {
                      await refreshAdminData();
                      onCatalogOrSettingsChanged();
                      showNotice(
                        r.seededProducts > 0
                          ? `Synced ${r.seededProducts} default products.`
                          : 'Catalog already includes all default drops.'
                      );
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#121b16] border border-[#24332a] text-xs font-bold uppercase hover:border-[#e0531f] cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Default Drop
                </button>
              </div>

              {products.map((p) => (
                <div
                  key={p.id}
                  className="bg-[#121b16] border border-[#24332a] rounded-lg p-3.5 flex items-center gap-4"
                >
                  <img
                    src={p.image}
                    alt={p.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded object-cover bg-[#090b0a] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-[#f4efe6] truncate">{p.name}</p>
                      {!p.active && (
                        <span className="text-[10px] font-bold uppercase text-[#ff6b6b]">
                          Hidden
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#9eb0a5] tabular-nums">
                      {p.category} · {formatINR(p.priceINR)} · Stock {getTotalStock(p)} units
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => loadProductIntoEditor(p)}
                      className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs font-bold uppercase hover:border-[#e0531f] cursor-pointer"
                    >
                      Edit
                    </button>

                    {confirmDeleteId === p.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          void deleteProductAdmin(p.id).then(async () => {
                            setConfirmDeleteId(null);
                            await refreshAdminData();
                            onCatalogOrSettingsChanged();
                            showNotice(`Deleted "${p.name}".`);
                          })
                        }
                        className="px-3 py-1.5 rounded bg-[#d9264e] text-white text-xs font-bold uppercase cursor-pointer"
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="p-2 rounded bg-[#090b0a] border border-[#24332a] text-[#9eb0a5] hover:text-[#ff6b6b] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: OUR CIRCLE VIPs */}
        {activeTab === 'circle' && (
          <div className="bg-[#121b16] border border-[#24332a] rounded-xl overflow-hidden">
            <div className="p-5 border-b border-[#24332a] flex items-center justify-between">
              <h2 className="font-display text-2xl uppercase">Our Circle VIP Roster</h2>
              <span className="text-xs text-[#9eb0a5] tabular-nums">
                {circleMembers.length} Registered
              </span>
            </div>
            {circleMembers.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#9eb0a5]">
                No VIP signups yet. Share the Our Circle section to collect WhatsApp early-access
                members.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-[#24332a] text-xs uppercase text-[#9eb0a5]">
                      <th className="py-3 px-5">Nickname</th>
                      <th className="py-3 px-4">WhatsApp</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">VIP Code</th>
                      <th className="py-3 px-5 text-right">Outreach</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#24332a]/60">
                    {circleMembers.map((m) => (
                      <tr key={m.id}>
                        <td className="py-3 px-5 font-semibold text-[#f4efe6]">{m.nickname}</td>
                        <td className="py-3 px-4 font-mono">+91 {m.whatsappPhone}</td>
                        <td className="py-3 px-4">{m.preferredSize}</td>
                        <td className="py-3 px-4 font-mono text-[#e0531f]">{m.vipCode}</td>
                        <td className="py-3 px-5 text-right">
                          <a
                            href={`https://wa.me/91${m.whatsappPhone}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold uppercase text-[#e0531f] hover:underline"
                          >
                            Message on WhatsApp
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: LEADS, RESTOCK ALERTS & BACKGROUND WEB PUSH */}
        {activeTab === 'leads' && (
          <div className="space-y-6">
            {/* Background Browser Web Push Blaster */}
            <form
              onSubmit={handleSendPushBlast}
              className="bg-[#121b16] border border-[#24332a] rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl uppercase">
                    Background Browser Push Blast
                  </h2>
                  <p className="text-xs text-[#9eb0a5]">
                    Reaches opted-in shoppers via Service Worker even when their browser tab is
                    closed ({pushSubscriberCount} subscribed device{pushSubscriberCount === 1 ? '' : 's'}
                    {webPushConfigured ? ' · VAPID Live' : ' · Configure VAPID keys in env'}).
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBlastTopic('CART_ABANDON');
                      setBlastTitle(`LOCK ${settings.vipDiscountPercent}% OFF BEFORE IT'S GONE`);
                      setBlastBody(
                        `Your Saucy Culture bag is still open! Tap back with ${settings.vipPromoCode} for ${settings.vipDiscountPercent}% OFF.`
                      );
                    }}
                    className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-[11px] font-bold uppercase hover:border-[#e0531f] cursor-pointer"
                  >
                    10% Cart Recovery Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBlastTopic('RESTOCK');
                      setBlastTitle('RESTOCK DROP LIVE AT SAUCY CULTURE');
                      setBlastBody(
                        `Sold-out sizes just landed back in New Delhi. Tap now + save ${settings.vipDiscountPercent}% with ${settings.vipPromoCode}!`
                      );
                    }}
                    className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-[11px] font-bold uppercase hover:border-[#e0531f] cursor-pointer"
                  >
                    Restock Hype Preset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#9eb0a5] mb-1">
                    Audience Topic
                  </label>
                  <select
                    value={blastTopic}
                    onChange={(e) =>
                      setBlastTopic(e.target.value as 'ALL' | 'CART_ABANDON' | 'RESTOCK')
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6]"
                  >
                    <option value="CART_ABANDON">Abandoned Cart Subscribers</option>
                    <option value="RESTOCK">Restock Alert Subscribers</option>
                    <option value="ALL">All Push Subscribers</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-[#9eb0a5] mb-1">
                    Notification Headline
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={90}
                    value={blastTitle}
                    onChange={(e) => setBlastTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6]"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold uppercase text-[#9eb0a5] mb-1">
                    Notification Body
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      maxLength={220}
                      value={blastBody}
                      onChange={(e) => setBlastBody(e.target.value)}
                      className="flex-1 px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#f4efe6]"
                    />
                    <button
                      type="submit"
                      disabled={sendingBlast}
                      className="px-4 py-2 rounded bg-[#e0531f] hover:bg-[#c84617] text-white text-xs font-bold uppercase inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sendingBlast ? 'Sending...' : 'Send Push'}
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Abandoned Cart Leads */}
              <div className="bg-[#121b16] border border-[#24332a] rounded-xl overflow-hidden">
                <div className="p-5 border-b border-[#24332a] flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-2xl uppercase">Abandoned Cart Leads</h2>
                    <p className="text-xs text-[#9eb0a5]">
                      Shoppers who added drops to bag and opted into {settings.vipDiscountPercent}%
                      OFF alerts.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#e0531f] tabular-nums">
                    {cartLeads.length} Leads
                  </span>
                </div>

                {cartLeads.length === 0 ? (
                  <p className="p-8 text-center text-sm text-[#9eb0a5]">
                    No cart recovery leads captured yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[#24332a]/70">
                    {cartLeads.map((lead) => {
                      const msg = encodeURIComponent(
                        `Yo! Your Saucy Culture bag (${lead.itemsSummary
                          .map((i) => `${i.name} ${i.size}`)
                          .join(', ')}) is still waiting — grab ${settings.vipDiscountPercent}% OFF right now with code ${lead.promoOffered}!`
                      );
                      return (
                        <div key={lead.id} className="p-4 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-[#f4efe6]">
                                {lead.channel === 'WHATSAPP' ? `+91 ${lead.contact}` : lead.contact}
                              </p>
                              <p className="text-xs text-[#9eb0a5] tabular-nums">
                                Bag {formatINR(lead.cartTotalINR)} · Code {lead.promoOffered} · Push{' '}
                                {lead.pushEnabled ? 'ON' : 'OFF'}
                              </p>
                            </div>
                            <span className="text-[11px] font-bold uppercase text-[#e0531f]">
                              {lead.status}
                            </span>
                          </div>
                          <p className="text-xs text-[#d8e0db]">
                            {lead.itemsSummary.map((i) => `${i.name} (${i.size}×${i.qty})`).join(', ')}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {lead.channel === 'WHATSAPP' && (
                              <a
                                href={`https://wa.me/91${lead.contact}?text=${msg}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded bg-[#e0531f] text-white text-[11px] font-bold uppercase"
                              >
                                Send {settings.vipDiscountPercent}% Off WhatsApp
                              </a>
                            )}
                            {lead.status === 'NEW' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateCartLeadStatusAdmin(lead.id, 'NOTIFIED').then(
                                    async () => {
                                      await refreshAdminData();
                                      showNotice('Lead marked Notified.');
                                    }
                                  )
                                }
                                className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-[11px] font-bold uppercase hover:border-[#f4efe6] cursor-pointer"
                              >
                                Mark Notified
                              </button>
                            )}
                            {lead.status !== 'CONVERTED' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateCartLeadStatusAdmin(lead.id, 'CONVERTED').then(
                                    async () => {
                                      await refreshAdminData();
                                      showNotice('Lead marked Converted.');
                                    }
                                  )
                                }
                                className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-[11px] font-bold uppercase hover:border-[#2ecc71] cursor-pointer"
                              >
                                Mark Converted
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Wishlist Back-in-Stock Alerts */}
              <div className="bg-[#121b16] border border-[#24332a] rounded-xl overflow-hidden">
                <div className="p-5 border-b border-[#24332a] flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-2xl uppercase">Restock Wishlist Alerts</h2>
                    <p className="text-xs text-[#9eb0a5]">
                      Updating sold-out sizes from 0 to 1+ automatically triggers background Web Push!
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#e0531f] tabular-nums">
                    {restockAlerts.length} Waiting
                  </span>
                </div>

                {restockAlerts.length === 0 ? (
                  <p className="p-8 text-center text-sm text-[#9eb0a5]">
                    No back-in-stock wishlist requests yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[#24332a]/70">
                    {restockAlerts.map((alert) => {
                      const isPhone = /^[6-9][0-9]{9}$/.test(alert.contact);
                      const pitch = buildRestockPitch({
                        productName: alert.productName,
                        size: alert.size,
                        promoCode: settings.vipPromoCode,
                        discountPercent: settings.vipDiscountPercent,
                      });
                      return (
                        <div key={alert.id} className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-[#f4efe6]">
                                {alert.productName} · Size {alert.size}
                              </p>
                              <p className="text-xs text-[#9eb0a5]">
                                {isPhone ? `+91 ${alert.contact}` : alert.contact} · Push{' '}
                                {alert.pushEnabled ? 'ON' : 'OFF'}
                              </p>
                            </div>
                            <span className="text-[11px] font-bold uppercase text-[#e0531f]">
                              {alert.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {isPhone && (
                              <a
                                href={`https://wa.me/91${alert.contact}?text=${encodeURIComponent(
                                  `${pitch.title} — ${pitch.body}`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded bg-[#e0531f] text-white text-[11px] font-bold uppercase"
                              >
                                Send Restock WhatsApp
                              </a>
                            )}
                            {alert.status === 'WAITING' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateRestockAlertStatusAdmin(alert.id, 'NOTIFIED').then(
                                    async () => {
                                      await refreshAdminData();
                                      showNotice('Restock alert marked Notified.');
                                    }
                                  )
                                }
                                className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-[11px] font-bold uppercase hover:border-[#f4efe6] cursor-pointer"
                              >
                                Mark Notified
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: STORE SETTINGS, HERO CMS & TEAM ACCESS */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleSaveSettings}
              className="lg:col-span-7 bg-[#121b16] border border-[#24332a] rounded-xl p-6 space-y-4"
            >
              <h2 className="font-display text-2xl uppercase">
                Storefront CMS &amp; Free UPI Config
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Hero Headline
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={settingsForm.heroTitle}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, heroTitle: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Hero Subtitle
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={settingsForm.heroSubtitle}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, heroSubtitle: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Merchant UPI ID (0% Fee QR)
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsForm.upiId}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, upiId: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    UPI Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsForm.upiMerchantName}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, upiMerchantName: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Free Ship Min (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={settingsForm.freeShippingThresholdINR}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        freeShippingThresholdINR: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Shipping Fee (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={settingsForm.shippingFeeINR}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        shippingFeeINR: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    VIP Code
                  </label>
                  <input
                    type="text"
                    value={settingsForm.vipPromoCode}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        vipPromoCode: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6] uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    VIP Off (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={settingsForm.vipDiscountPercent}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        vipDiscountPercent: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6] tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                  Top Announcement Banner
                </label>
                <input
                  type="text"
                  required
                  maxLength={180}
                  value={settingsForm.announcementText}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, announcementText: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Support WhatsApp (with 91)
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsForm.supportWhatsapp}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, supportWhatsapp: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-[#d8e0db] mb-1">
                    Support Email
                  </label>
                  <input
                    type="email"
                    required
                    value={settingsForm.supportEmail}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, supportEmail: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded bg-[#090b0a] border border-[#24332a] text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsForm.maintenanceMode}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, maintenanceMode: e.target.checked }))
                  }
                  className="accent-[#e0531f]"
                />
                <span>
                  <strong className="text-[#f4efe6]">Drop Lock / Maintenance Mode</strong> — hides
                  public storefront catalog while keeping Track Order &amp; Admin open
                </span>
              </label>

              <button
                type="submit"
                className="px-6 py-3 rounded bg-[#e0531f] hover:bg-[#c84617] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Save Store Settings
              </button>
            </form>

            {/* Admin Team Access */}
            <div className="lg:col-span-5 bg-[#121b16] border border-[#24332a] rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-display text-2xl uppercase">Client &amp; Team Access</h2>
                <p className="text-xs text-[#9eb0a5] mt-1">
                  Invite your client&apos;s Google email. Every move they make is recorded under
                  their verified email in the tamper-evident Audit Log.
                </p>
              </div>

              {isOwner ? (
                <form onSubmit={handleAddAdmin} className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="client@gmail.com"
                    className="flex-1 px-3 py-2 rounded bg-[#090b0a] border border-[#24332a] text-sm text-[#f4efe6]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-[#e0531f] text-white text-xs font-bold uppercase cursor-pointer"
                  >
                    Add
                  </button>
                </form>
              ) : (
                <div className="px-3 py-2.5 rounded bg-[#090b0a] border border-[#24332a] text-xs text-[#9eb0a5] flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-[#e0531f] shrink-0" />
                  Only the Store Owner can invite or revoke admin accounts.
                </div>
              )}

              <ul className="space-y-2 text-xs">
                <li className="px-3 py-2.5 rounded bg-[#090b0a] border border-[#24332a] flex items-center justify-between">
                  <span className="font-semibold text-[#f4efe6]">{SUPER_ADMIN_EMAIL}</span>
                  <span className="text-[#e0531f] font-bold uppercase">Owner</span>
                </li>
                {adminList
                  .filter((adm) => adm.email !== SUPER_ADMIN_EMAIL)
                  .map((adm) => (
                    <li
                      key={adm.email}
                      className="px-3 py-2.5 rounded bg-[#090b0a] border border-[#24332a] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{adm.email}</span>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() =>
                            void removeAdminEmail(adm.email).then(async () => {
                              await refreshAdminData();
                              showNotice(`Revoked access for ${adm.email}.`);
                            })
                          }
                          className="text-[#ff6b6b] font-bold uppercase hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-[10px] text-[#9eb0a5] uppercase">Admin</span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}

        {/* TAB 6: TAMPER-EVIDENT AUDIT LOG */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-[#121b16] border border-[#24332a] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                {auditVerification?.valid !== false ? (
                  <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-6 h-6 text-[#ff6b6b] shrink-0 mt-0.5" />
                )}
                <div>
                  <h2 className="font-display text-2xl uppercase">
                    Tamper-Evident Admin Audit Trail
                  </h2>
                  <p className="text-xs text-[#9eb0a5] mt-0.5">
                    {auditVerification?.valid !== false
                      ? `SHA-256 Hash Chain Verified · ${auditLogs.length} immutable action(s) logged with actor email, IP, and payload digest.`
                      : `WARNING: Hash chain mismatch detected at entry #${auditVerification?.brokenAtSeq}: ${auditVerification?.reason}`}
                  </p>
                </div>
              </div>

              {isOwner ? (
                <div className="flex flex-wrap items-center gap-2">
                  {confirmAuditAction === 'KEEP_RECENT' ? (
                    <button
                      type="button"
                      onClick={() => void handlePruneAuditLogs('KEEP_RECENT')}
                      className="px-3 py-1.5 rounded bg-[#e0531f] text-white text-xs font-bold uppercase cursor-pointer"
                    >
                      Confirm Keep Latest 50
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAuditAction('KEEP_RECENT')}
                      className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs font-bold uppercase hover:border-[#e0531f] cursor-pointer"
                    >
                      Archive (Keep 50)
                    </button>
                  )}

                  {confirmAuditAction === 'CLEAR_ALL' ? (
                    <button
                      type="button"
                      onClick={() => void handlePruneAuditLogs('CLEAR_ALL')}
                      className="px-3 py-1.5 rounded bg-[#d9264e] text-white text-xs font-bold uppercase cursor-pointer"
                    >
                      Confirm Clear All
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAuditAction('CLEAR_ALL')}
                      className="px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-[#ff6b6b] text-xs font-bold uppercase hover:border-[#ff6b6b] cursor-pointer"
                    >
                      Clear Logs (Owner)
                    </button>
                  )}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#090b0a] border border-[#24332a] text-xs font-bold uppercase text-[#9eb0a5]">
                  <Lock className="w-3.5 h-3.5 text-[#e0531f]" />
                  Locked · Owner Only Can Prune
                </span>
              )}
            </div>

            {auditLogs.length === 0 ? (
              <div className="bg-[#121b16] border border-[#24332a] rounded-xl p-10 text-center text-sm text-[#9eb0a5]">
                No admin mutations recorded yet. Every product edit, order update, setting change,
                and push blast will appear here.
              </div>
            ) : (
              <div className="bg-[#121b16] border border-[#24332a] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#24332a] text-[11px] uppercase text-[#9eb0a5]">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Actor (Google)</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Target</th>
                        <th className="py-3 px-4">Details</th>
                        <th className="py-3 px-4">SHA-256 Digest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#24332a]/60">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="align-top">
                          <td className="py-3 px-4 font-mono text-[#e0531f] font-bold">
                            #{log.seq}
                          </td>
                          <td className="py-3 px-4 text-[#9eb0a5] whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-[#f4efe6] block">
                              {log.actorEmail}
                            </span>
                            <span className="text-[10px] uppercase text-[#9eb0a5]">
                              {log.actorRole} · IP {log.ipAddress}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold uppercase text-[#f4efe6] whitespace-nowrap">
                            {log.action}
                          </td>
                          <td className="py-3 px-4 font-mono text-[#d8e0db]">
                            {log.entityType}:{log.entityId}
                          </td>
                          <td className="py-3 px-4 max-w-xs break-all font-mono text-[11px] text-[#9eb0a5]">
                            {log.detailsJson}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                            {log.entryHash.slice(0, 14)}…
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
