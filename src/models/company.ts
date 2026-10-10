export interface CompanyProfile {
  id: string;
  businessName: string;
  tradeName?: string;
  gstin: string;
  pan: string;
  stateCode: string;
  address: string;
  pincode: string;
  city?: string;
  phone: string;
  email: string;
  website?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  upiId?: string;
  termsAndConditions?: string;
  invoicePrefix?: string;
  logoUrl?: string;
  isGstEnabled?: boolean;
}
