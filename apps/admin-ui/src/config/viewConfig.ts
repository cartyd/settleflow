export const batchesViewConfig = {
  // Page configuration
  pageTitle: "Settlement Batches - SettleFlow",
  heading: "Settlement Batches",
  emptyMessage: "No batches found.",

  // API/Route configuration
  baseUrl: "/admin/batches",
  detailViewPath: (batchId: string) => `/admin/batches/${batchId}`,
  listViewPath: "/admin/batches",

  // Table column configuration
  columns: {
    agency: "Agency",
    nvlPaymentRef: "NVL Payment Ref",
    weekPeriod: "Week Period",
    status: "Status",
    netAmount: "Net Amount",
    actions: "Actions",
  },

  // Date format
  dateFormat: {
    startDate: "MMM D",
    endDate: "MMM D, YYYY",
    fileUploadDate: "MMM D, YYYY",
  },

  // Currency configuration
  currency: {
    symbol: "$",
    decimalPlaces: 2,
  },

  // Action labels
  actionLabels: {
    view: "View",
    backToBatches: "← Back to Batches",
  },
};

// Batch detail page configuration
export const batchDetailConfig = {
  pageTitle: (ref: string) => `Batch ${ref} - SettleFlow`,
  headingPrefix: "Batch:",
  agencyLabel: "Agency",
  statusLabel: "Status",
  separator: " | ",

  infoItems: {
    totalRevenue: {
      label: "Total Revenue",
    },
    totalAdvances: {
      label: "Total Advances",
    },
    netAmount: {
      label: "Net Amount",
    },
  },

  importFiles: {
    heading: "Import Files",
    emptyMessage: "No import files yet.",
    fileNameLabel: "File Name",
    uploadDateLabel: "Uploaded At",
  },
};

// Error page configuration
export const errorPageConfig = {
  pageTitle: (statusCode?: number) => `Error${statusCode ? ` ${statusCode}` : ""} - SettleFlow`,
  heading: "Oops! Something went wrong",

  errorTypes: {
    400: {
      title: "Bad Request",
      message: "The request could not be understood by the server.",
      severity: "warning",
      userMessage: "Invalid request. Please check your input and try again.",
    },
    403: {
      title: "Access Denied",
      message: "You do not have permission to access this resource.",
      severity: "error",
      userMessage: "You do not have permission to view this page. Contact support if you believe this is an error.",
    },
    404: {
      title: "Page Not Found",
      message: "The requested resource was not found.",
      severity: "info",
      userMessage: "The page you're looking for doesn't exist.",
    },
    500: {
      title: "Server Error",
      message: "An unexpected error occurred on the server.",
      severity: "error",
      userMessage: "We encountered an unexpected error. Our team has been notified.",
    },
    503: {
      title: "Service Unavailable",
      message: "The server is temporarily unavailable.",
      severity: "error",
      userMessage: "The service is temporarily unavailable. Please try again later.",
    },
  },

  defaultError: {
    title: "Unknown Error",
    message: "An unexpected error occurred.",
    severity: "error",
    userMessage: "Something went wrong. Please try again or contact support.",
  },

  actions: {
    backToBatches: {
      label: "← Back to Batches",
      href: "/admin/batches",
    },
    home: {
      label: "Go to Dashboard",
      href: "/admin",
    },
    contactSupport: {
      label: "Contact Support",
      href: "mailto:support@settleflow.com",
    },
  },

  messages: {
    errorId: "Error ID",
    timestamp: "Time",
    tryAgain: "Try Again",
    goHome: "Go Home",
  },
};
