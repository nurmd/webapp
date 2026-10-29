import React from 'react';
import {
  DocumentLineItemsGrid,
  DocumentGridRow,
} from '../../Common/Billing/DocumentLineItemsGrid.tsx';

export type PurchaseGridRow = DocumentGridRow;

export interface PurchaseLineItemsGridProps {
  rows: PurchaseGridRow[];
  calcItems: Array<{
    discountAmount: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    cessAmount?: number;
    totalAmount: number;
  }>;
  isGstActive: boolean;
  onAddItem: () => void;
  onEditItem: (index: number) => void;
  onRemoveItem?: (index: number) => void;
  onOpenScanner: () => void;
}

export const PurchaseLineItemsGrid: React.FC<PurchaseLineItemsGridProps> = (props) => {
  return <DocumentLineItemsGrid {...props} kind="purchase" mode="interactive" />;
};
