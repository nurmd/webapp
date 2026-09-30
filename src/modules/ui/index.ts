/**
 * @module UI
 * @description Application Shell, Navigation, Theme System, and Common Overlays.
 * 
 * Provides:
 * - Application Shell: Header, Sidebar, Drawer, and BottomNav.
 * - Navigation Menu Hub (Category grid, live search, quick-action tiles).
 * - Modal components:
 *   - CameraBarcodeScannerModal (WebRTC camera barcode/QR scanner)
 *   - ThermalPrintModal (Native ESC/POS & browser thermal print dialog)
 *   - WhatsAppShareModal (Direct WhatsApp Web/App invoice link sharing)
 *   - RoleSwitchModal (Role-based access control profile switcher)
 *   - AppUpdateModal (Over-The-Air GitHub release updater)
 * - Stitch Design System components and tokens.
 */

export { Header } from '../../components/Shell/Header.tsx';
export { Drawer } from '../../components/Shell/Drawer.tsx';
export { BottomNav } from '../../components/Shell/BottomNav.tsx';
export { Sidebar } from '../../components/Sidebar.tsx';
export { Navbar } from '../../components/Navbar.tsx';
export { NavigationMenuHubView } from '../../components/Navigation/NavigationMenuHubView.tsx';
export { CameraBarcodeScannerModal } from '../../components/Scanner/CameraBarcodeScannerModal.tsx';
export { ThermalPrintModal } from '../../components/Printing/ThermalPrintModal.tsx';
export { WhatsAppShareModal } from '../../components/WhatsApp/WhatsAppShareModal.tsx';
export { RoleSwitchModal } from '../../components/Auth/RoleSwitchModal.tsx';
export { AppUpdateModal } from '../../components/Update/AppUpdateModal.tsx';
export { CompanySettingsView } from '../../components/Settings/CompanySettingsView.tsx';
