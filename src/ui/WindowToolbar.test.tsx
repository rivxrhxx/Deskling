import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ToolbarValues } from './WindowToolbar';
import { WindowToolbar } from './WindowToolbar';

const values: ToolbarValues = { size: 'm', opacity: 0.8, floatOnTop: true, motion: 'system' };

function setup(overrides: Partial<ToolbarValues> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(<WindowToolbar values={{ ...values, ...overrides }} onChange={onChange} onClose={onClose} />);
  return { onChange, onClose, toolbar: screen.getByRole('toolbar', { name: '창 설정' }) };
}

describe('WindowToolbar (FR-W2, FR-W4, FR-W5, FR-W8, FR-M2)', () => {
  it('offers size presets with the current one pressed', async () => {
    const { onChange, toolbar } = setup();
    expect(within(toolbar).getByRole('button', { name: '보통 크기' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(toolbar).getByRole('button', { name: '작게' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(toolbar).getByRole('button', { name: '크게' }));
    expect(onChange).toHaveBeenCalledWith({ size: 'l' });
  });

  it('changes opacity in percent between 30 and 100', () => {
    const { onChange, toolbar } = setup();
    const slider = within(toolbar).getByRole('slider', { name: '불투명도' });
    expect(slider).toHaveAttribute('min', '30');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveValue('80');
    fireEvent.change(slider, { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledWith({ opacity: 0.45 });
  });

  it('toggles floating above other windows (off = embedded in the desktop)', async () => {
    const { onChange, toolbar } = setup();
    const pin = within(toolbar).getByRole('button', { name: '위에 띄우기' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(pin);
    expect(onChange).toHaveBeenCalledWith({ floatOnTop: false });
  });

  it.each([
    ['system', '모션: 시스템 설정', 'reduced'],
    ['reduced', '모션: 줄이기', 'full'],
    ['full', '모션: 전체', 'system'],
  ] as const)('cycles motion from %s', async (motion, name, next) => {
    const { onChange, toolbar } = setup({ motion });
    await userEvent.click(within(toolbar).getByRole('button', { name }));
    expect(onChange).toHaveBeenCalledWith({ motion: next });
  });

  it('closes the app', async () => {
    const { onClose, toolbar } = setup();
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Deskling 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is excluded from window dragging', () => {
    const { toolbar } = setup();
    expect(toolbar).toHaveAttribute('data-no-drag');
  });
});
