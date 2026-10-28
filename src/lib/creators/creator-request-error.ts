export class CreatorRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly candidates: readonly { id: number; name: string }[] = [],
  ) {
    super(message);
    this.name = "CreatorRequestError";
  }
}
