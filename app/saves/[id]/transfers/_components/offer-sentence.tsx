/** An offer's sentence, its amount in bold. The messages stay plain text: src/i18n/messages.test.ts formats them so. */
export function OfferSentence({ text, amount }: { text: string; amount: string }) {
  const start = text.indexOf(amount);
  if (start < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, start)}
      <strong className="whitespace-nowrap">{amount}</strong>
      {text.slice(start + amount.length)}
    </>
  );
}
