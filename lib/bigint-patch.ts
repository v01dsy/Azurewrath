// lib/bigint-patch.ts

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};