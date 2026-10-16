import { fireEvent, render, screen } from '@testing-library/react';
import WatchTillZoneEditor from '../../../components/watch/WatchTillZoneEditor';

const ZONE = { x: 0.5, y: 0.4, w: 0.3, h: 0.5 };
const SNAPSHOT = 'data:image/jpeg;base64,/9j/4AAQ';

const loadImage = (img, width, height) => {
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  fireEvent.load(img);
};

describe('WatchTillZoneEditor', () => {
  it('draws on the camera picture, shaped like the picture (4:3 CCTV)', () => {
    render(<WatchTillZoneEditor imageUrl={SNAPSHOT} capturedAt="2026-10-12T09:00:00Z" zone={ZONE} onChange={() => {}} />);

    const surface = screen.getByTestId('watch-till-editor');
    expect(surface.style.aspectRatio).toBe(String(16 / 9));
    loadImage(screen.getByAltText('What the camera sees'), 640, 480);
    expect(surface.style.aspectRatio).toBe(String(4 / 3));
    expect(screen.getByText(/Picture from/)).toBeInTheDocument();

    const box = screen.getByTestId('watch-till-zone');
    expect(box.style.left).toBe('50%');
    expect(box.style.width).toBe('30%');
  });

  it('starts a new picture at 16:9 until it has loaded', () => {
    const { rerender } = render(<WatchTillZoneEditor imageUrl={SNAPSHOT} zone={ZONE} onChange={() => {}} />);
    loadImage(screen.getByAltText('What the camera sees'), 640, 480);

    rerender(<WatchTillZoneEditor imageUrl={`${SNAPSHOT}AAAA`} zone={ZONE} onChange={() => {}} />);
    expect(screen.getByTestId('watch-till-editor').style.aspectRatio).toBe(String(16 / 9));
  });

  it('explains where the picture comes from when there is none yet', () => {
    render(<WatchTillZoneEditor zone={ZONE} onChange={() => {}} />);
    expect(screen.getByText(/picture appears here once its Watch device is running/)).toBeInTheDocument();
  });

  it('changes the zone from the number fields', () => {
    const onChange = vi.fn();
    render(<WatchTillZoneEditor zone={ZONE} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Left'), { target: { value: '0.1' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'counter', x: 0.1, w: 0.3 }));
  });
});
