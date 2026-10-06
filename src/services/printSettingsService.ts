export interface A4PrintSettings {
  invoiceTitle: string;
  invoiceSubtitle: string;
  defaultCopyLabel: string;
  showLogo: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showReverseCharge: boolean;
  showDueDate: boolean;
  showStateCode: boolean;
  showHsnColumn: boolean;
  showDiscountColumn: boolean;
  showTaxBreakdown: boolean;
  showAmountInWords: boolean;
  showTaxInWords: boolean;
  showTaxSummaryTable: boolean;
  showBankDetails: boolean;
  showUpiQr: boolean;
  qrSize: 'small' | 'medium' | 'large';
  showSignatureBox: boolean;
  signatoryText: string;
  termsAndConditions: string;
  customFooterNote: string;
}

export interface ThermalPrintSettings {
  paperWidth: 32 | 48;
  receiptTitle: string;
  customStoreName: string;
  showAddress: boolean;
  showPhone: boolean;
  showGstin: boolean;
  centerHeader: boolean;
  showItemDiscount: boolean;
  showRateBreakdown: boolean;
  showHsn: boolean;
  showTaxBreakdown: boolean;
  showBalanceDue: boolean;
  showUpiQr: boolean;
  kickDrawer: boolean;
  autoCut: boolean;
  extraFeedLines: number;
  greetingText: string;
  showJurisdiction: boolean;
  jurisdictionText: string;
  showPoweredBy: boolean;
}

export interface AppPrintSettings {
  defaultFormat: 'A4' | 'Thermal-58mm' | 'Thermal-80mm';
  a4: A4PrintSettings;
  thermal: ThermalPrintSettings;
}

export const DEFAULT_A4_SETTINGS: A4PrintSettings = {
  invoiceTitle: 'TAX INVOICE',
  invoiceSubtitle: '(Issued under Section 31 of CGST Act, 2017 read with Rule 46 of CGST Rules, 2017)',
  defaultCopyLabel: 'ORIGINAL FOR RECIPIENT',
  showLogo: true,
  showPhone: true,
  showEmail: true,
  showReverseCharge: true,
  showDueDate: true,
  showStateCode: true,
  showHsnColumn: true,
  showDiscountColumn: true,
  showTaxBreakdown: true,
  showAmountInWords: true,
  showTaxInWords: true,
  showTaxSummaryTable: true,
  showBankDetails: true,
  showUpiQr: true,
  qrSize: 'medium',
  showSignatureBox: true,
  signatoryText: 'Authorised Signatory',
  termsAndConditions: '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged for delayed payment.',
  customFooterNote: 'Thank you for your business!',
};

export const DEFAULT_THERMAL_SETTINGS: ThermalPrintSettings = {
  paperWidth: 32,
  receiptTitle: 'TAX INVOICE',
  customStoreName: '',
  showAddress: true,
  showPhone: true,
  showGstin: true,
  centerHeader: true,
  showItemDiscount: true,
  showRateBreakdown: true,
  showHsn: false,
  showTaxBreakdown: true,
  showBalanceDue: true,
  showUpiQr: true,
  kickDrawer: false,
  autoCut: true,
  extraFeedLines: 2,
  greetingText: 'Thank you! Visit again.',
  showJurisdiction: true,
  jurisdictionText: 'Subject to local jurisdiction',
  showPoweredBy: false,
};

const STORAGE_KEY = 'app_custom_print_settings';

export const printSettingsService = {
  getSettings(): AppPrintSettings {
    const rawDefault = localStorage.getItem('defaultPrintOption');
    const legacyWidth = Number(localStorage.getItem('printer_paper_width')) as 32 | 48;

    let defaultFormat: 'A4' | 'Thermal-58mm' | 'Thermal-80mm' = 'A4';
    if (rawDefault === 'Thermal-58mm' || rawDefault === 'Thermal-80mm' || rawDefault === 'A4') {
      defaultFormat = rawDefault;
    } else if (legacyWidth === 48) {
      defaultFormat = 'Thermal-80mm';
    } else if (legacyWidth === 32) {
      defaultFormat = 'Thermal-58mm';
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          defaultFormat: parsed.defaultFormat || defaultFormat,
          a4: { ...DEFAULT_A4_SETTINGS, ...parsed.a4 },
          thermal: {
            ...DEFAULT_THERMAL_SETTINGS,
            paperWidth: legacyWidth === 48 || parsed.thermal?.paperWidth === 48 ? 48 : 32,
            ...parsed.thermal,
          },
        };
      }
    } catch (e) {
      console.warn('Failed to parse print settings from storage', e);
    }

    return {
      defaultFormat,
      a4: { ...DEFAULT_A4_SETTINGS },
      thermal: {
        ...DEFAULT_THERMAL_SETTINGS,
        paperWidth: legacyWidth === 48 ? 48 : 32,
      },
    };
  },

  saveSettings(settings: AppPrintSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      localStorage.setItem('defaultPrintOption', settings.defaultFormat);
      localStorage.setItem('printer_paper_width', settings.thermal.paperWidth.toString());
      window.dispatchEvent(new Event('print_settings_updated'));
    } catch (e) {
      console.error('Failed to save print settings', e);
    }
  },

  resetDefaults(): AppPrintSettings {
    const defaults: AppPrintSettings = {
      defaultFormat: 'A4',
      a4: { ...DEFAULT_A4_SETTINGS },
      thermal: { ...DEFAULT_THERMAL_SETTINGS },
    };
    this.saveSettings(defaults);
    return defaults;
  },
};
