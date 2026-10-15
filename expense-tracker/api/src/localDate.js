// YYYY-MM-DD in the process time zone (TZ, set to Asia/Jakarta in docker-compose).
// toISOString() is always UTC, which dates anything logged 00:00-07:00 WIB to the previous day.
export const localDate = (d = new Date()) =>
  new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
