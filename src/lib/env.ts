import "server-only";

const LOCAL_ADMIN_EMAIL = "admin@groundeddesk.local";
const LOCAL_APP_URL = "http://127.0.0.1:3000";

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
  const appUrl = process.env.APP_URL;

  if (appUrl) {
    return appUrl;
  }

  if (process.env.NODE_ENV !== "production") {
    return LOCAL_APP_URL;
  }

  throw new Error("缺少生产环境变量 APP_URL");
}
