// lib/bigint-patch.ts
// lol penis

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};