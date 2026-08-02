import "server-only";

import { getApplicationUrl } from "./server-config";

const LOCAL_ADMIN_EMAIL = "admin@groundeddesk.local";

export function getAdminEmail() {
  const email = process.env.ADMIN_EMAIL;

  if (email) {
    return email.toLowerCase();
  }

  if (process.env.NODE_ENV !== "production") {
    return LOCAL_ADMIN_EMAIL;
  }

  throw new Error("缺少生产环境变量 ADMIN_EMAIL");
}

export function getAppUrl() {
  return getApplicationUrl();
}
