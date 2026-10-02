import React from 'react';
import { PartyDetailPage, PartyDetailPageProps } from './PartyDetailPage.tsx';

export interface PartyDetailModalProps extends Omit<PartyDetailPageProps, 'onBack'> {
  onClose: () => void;
}

export const PartyDetailModal: React.FC<PartyDetailModalProps> = ({
  onClose,
  ...props
}) => {
  return <PartyDetailPage onBack={onClose} {...props} />;
};

export { PartyDetailPage };
export type { PartyDetailPageProps };
