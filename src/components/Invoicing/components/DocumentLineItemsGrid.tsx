import React from 'react';
import {
  DocumentLineItemsGrid,
  DocumentLineItemsGridProps,
  DocumentGridRow,
} from '../../Common/Billing/DocumentLineItemsGrid.tsx';

export type { DocumentGridRow };
export type { DocumentLineItemsGridProps };

export const InvoicingDocumentLineItemsGrid: React.FC<
  Omit<DocumentLineItemsGridProps, 'kind'>
> = (props) => {
  return <DocumentLineItemsGrid {...props} kind="invoice" />;
};

export { DocumentLineItemsGrid };
