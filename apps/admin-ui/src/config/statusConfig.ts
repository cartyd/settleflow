export interface StatusConfig {
  [key: string]: {
    label: string;
    cssClass: string;
  };
}

export const batchStatusConfig: StatusConfig = {
  CREATED: {
    label: "Created",
    cssClass: "status-created",
  },
  LOCKED: {
    label: "Locked",
    cssClass: "status-locked",
  },
  PAID: {
    label: "Paid",
    cssClass: "status-paid",
  },
};

export function getStatusConfig(status: string): {
  label: string;
  cssClass: string;
} {
  return (
    batchStatusConfig[status] || {
      label: status,
      cssClass: "status-created",
    }
  );
}
