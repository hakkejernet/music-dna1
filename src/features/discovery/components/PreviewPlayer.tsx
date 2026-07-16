interface Props {
  previewUrl: string | null;
}

export const PreviewPlayer = ({ previewUrl }: Props) => {
  if (!previewUrl) {
    return <p className="preview-player preview-player--empty">30-sekunders preview er ikke tilgængelig for denne sang.</p>;
  }

  return (
    <audio className="preview-player" controls src={previewUrl}>
      Din browser understøtter ikke lydafspilning.
    </audio>
  );
};
