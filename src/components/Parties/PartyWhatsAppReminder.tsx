import React from 'react';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { WhatsAppShareModal } from '../Common/WhatsAppShareModal.tsx';
import { WhatsAppTemplateType } from '../../core/utils/upiAndShare.ts';

export interface PartyWhatsAppReminderProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party;
  company: CompanyProfile;
  liveNetBalance?: number;
  initialTemplate?: WhatsAppTemplateType;
}

export const PartyWhatsAppReminder: React.FC<PartyWhatsAppReminderProps> = ({
  isOpen,
  onClose,
  party,
  company,
  liveNetBalance,
  initialTemplate,
}) => {
  if (!isOpen) return null;

  const balance = liveNetBalance !== undefined ? liveNetBalance : party.currentBalance;
  const template = initialTemplate || (balance > 0 ? 'GENTLE_REMINDER' : 'PARTY_STATEMENT');

  return (
    <WhatsAppShareModal
      isOpen={isOpen}
      onClose={onClose}
      company={company}
      party={party}
      initialPartyName={party.name}
      initialPhone={party.phone}
      initialBalance={balance}
      initialTemplate={template}
    />
  );
};
