import globalize from 'lib/globalize';
import { TICKS_PER_SECOND } from 'constants/time';

/**
 * Shows a short "+30 seconds" / "−10 seconds" text in an element for each skip press.
 * Presses made while the text is still showing add up, matching the single seek they end up as.
 * @param {HTMLElement} element The element to show the text in. It is left empty when nothing is showing.
 * @returns {{show: function(number): void, hide: function(): void}} Call `show` with the skipped ticks.
 */
export function createSkipFlash(element) {
    let timer;
    let totalTicks = 0;
    let visible = false;

    return {
        show(offsetTicks) {
            totalTicks = visible ? totalTicks + offsetTicks : offsetTicks;
            visible = true;

            const seconds = Math.round(Math.abs(totalTicks) / TICKS_PER_SECOND);
            element.textContent = `${totalTicks >= 0 ? '+' : '−'}${globalize.translate('ValueSeconds', seconds)}`;

            clearTimeout(timer);
            timer = setTimeout(() => this.hide(), 1000);
        },
        hide() {
            clearTimeout(timer);
            visible = false;
            element.textContent = '';
        }
    };
}
