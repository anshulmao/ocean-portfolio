const star = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2.25 2.98 6.04 6.67.97-4.83 4.71 1.14 6.65L12 17.48l-5.96 3.14 1.14-6.65-4.83-4.71 6.67-.97L12 2.25Z"/></svg>';

/** Return the accessible, five-choice safety-stop rating fieldset. */
export function safetyRatingMarkup() {
  const options = [1, 2, 3, 4, 5].map(value =>
    `<label><input type="radio" name="rating" value="${value}" required aria-label="${value} out of 5"><span>${star}<small>${value}</small></span></label>`
  ).join('');

  return `<fieldset class="star-rating"><legend>Rate your dive</legend><div class="star-options">${options}</div></fieldset>`;
}
