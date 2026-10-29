import React from 'react';
import { Party } from '../../models/party.ts';
import { SelectPartyModal, SelectPartyModalProps } from '../Parties/SelectPartyModal.tsx';

export interface SelectPosPartyModalProps {
  isOpen: boolean;
  parties: Party[];
  selectedParty: Party | null;
  onSelectParty: (party: Party) => void;
  onClose: () => void;
}

export const SelectPosPartyModal: React.FC<SelectPosPartyModalProps> = (props) => {
  return <SelectPartyModal {...props} mode="pos" />;
};

export { SelectPartyModal };
export type { SelectPartyModalProps };
