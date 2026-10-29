import React from 'react';
import {
  DocumentLineItemsGrid,
  DocumentLineItemsGridProps,
  DocumentGridRow,
} from '../../Common/Billing/DocumentLineItemsGrid.tsx';

export type { DocumentGridRow };
export type { DocumentLineItemsGridProps };

export const PurchasesDocumentLineItemsGrid: React.FC<
  Omit<DocumentLineItemsGridProps, 'kind'>
> = (props) => {
  return <DocumentLineItemsGrid {...props} kind="purchase" />;
};

export { DocumentLineItemsGrid };
