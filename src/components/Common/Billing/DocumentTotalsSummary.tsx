import React from 'react';
import {
  DocumentTaxSummary,
  DocumentTaxSummaryProps,
} from './DocumentTaxSummary.tsx';

export type DocumentTotalsSummaryProps = DocumentTaxSummaryProps;

export const DocumentTotalsSummary: React.FC<DocumentTotalsSummaryProps> = (props) => {
  return <DocumentTaxSummary {...props} variant="full" />;
};

export { DocumentTaxSummary };
