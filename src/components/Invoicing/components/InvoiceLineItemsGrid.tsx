import React from 'react';
import {
  DocumentLineItemsGrid,
  DocumentGridRow,
} from '../../Common/Billing/DocumentLineItemsGrid.tsx';

export type GridRow = DocumentGridRow;

export interface InvoiceLineItemsGridProps {
  rows: GridRow[];
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
  onOpenScanner: () => void;
}

export const InvoiceLineItemsGrid: React.FC<InvoiceLineItemsGridProps> = (props) => {
  return <DocumentLineItemsGrid {...props} kind="invoice" mode="interactive" />;
};
