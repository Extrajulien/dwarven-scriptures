import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { updateRoomConfig } from '../../app/rooms/actions';
import { MESSAGES } from '../../i18n/messages';
import { defaultRoomConfig } from '../../lib/room-config';
import type { RoomConfig } from '../../db/schema';
import RaceConfigEditor, {
  buildConfigPayload,
  draftFromConfig,
} from './RaceConfigEditor';

const messages = MESSAGES.fr;
const ROOM_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('../../app/rooms/actions', () => ({
  updateRoomConfig: jest.fn(),
}));

const mockedUpdateRoomConfig = jest.mocked(updateRoomConfig);

function renderEditor(config: RoomConfig = defaultRoomConfig, canEdit = true, lockedReason: string | null = null) {
  return render(
    <RaceConfigEditor
      config={config}
      roomPublicId={ROOM_PUBLIC_ID}
      canEdit={canEdit}
      lockedReason={lockedReason}
      messages={messages}
    />,
  );
}

function submitForm() {
  const form = document.querySelector('form[data-purpose="race-config-form"]');
  if (!form) {
    throw new Error('race-config-form not found');
  }
  fireEvent.submit(form);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUpdateRoomConfig.mockReset();
});

describe('RaceConfigEditor (CONF-01..10)', () => {
  test('a host sees an editable form showing the current values', () => {
    renderEditor();

    expect(screen.getByLabelText('Langue du texte')).toHaveValue('fr');
    expect(screen.getByLabelText('Complexité')).toHaveValue('moyen');
    expect(screen.getByLabelText('Type de texte')).toHaveValue('coherent');
    expect(screen.getByLabelText('Nombre de mots')).toHaveValue(60);
    expect(screen.getByLabelText('Temps maximal')).toHaveValue(60);
    expect(screen.getByLabelText('Mode d’erreur')).toHaveValue('accumulate');

    expect(screen.getByLabelText('Ponctuation')).toBeChecked();
    expect(screen.getByLabelText('Nombres')).toBeChecked();
    expect(screen.getByLabelText('Majuscules')).toBeChecked();
    expect(screen.getByLabelText('Accents')).toBeChecked();
    expect(screen.getByLabelText('Accents')).toBeEnabled();

    expect(screen.getByLabelText('Bonus de remontée')).toBeChecked();
    expect(screen.queryByLabelText('Niveau')).not.toBeInTheDocument();
    expect(screen.getByText('Les bots rejoignent les courses à partir de la phase 4.')).toBeInTheDocument();

    for (const id of ['config-text-language', 'config-word-count', 'config-bonuses']) {
      expect(document.getElementById(id)).toBeEnabled();
    }
    expect(screen.getByRole('button', { name: 'Enregistrer la configuration' })).toBeEnabled();
  });

  test('a non-host or non-waiting viewer gets a disabled form with the localized reason', () => {
    renderEditor(defaultRoomConfig, false, 'La configuration est figée une fois la course lancée.');

    expect(screen.getByText('La configuration est figée une fois la course lancée.')).toBeInTheDocument();
    for (const id of [
      'config-text-language',
      'config-text-complexity',
      'config-text-type',
      'config-word-count',
      'config-time-limit',
      'config-error-mode',
      'config-option-punctuation',
      'config-bonuses',
    ]) {
      expect(document.getElementById(id)).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Enregistrer la configuration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ajouter un bot' })).toBeDisabled();
  });

  test('rejects a bad word count and time limit before calling the action', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Nombre de mots'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Temps maximal'), { target: { value: '15' } });
    submitForm();

    expect(screen.getByText('Entre 10 et 200 mots.')).toBeInTheDocument();
    expect(screen.getByText('Entre 30 secondes et 10 minutes.')).toBeInTheDocument();
    expect(mockedUpdateRoomConfig).not.toHaveBeenCalled();
  });

  test('rejects an out-of-range bot count', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un bot' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '31' } });
    submitForm();

    expect(screen.getByText('Entre 1 et 30 bots par niveau.')).toBeInTheDocument();
    expect(mockedUpdateRoomConfig).not.toHaveBeenCalled();
  });

  test('adding and removing bots updates the submitted payload', async () => {
    mockedUpdateRoomConfig.mockResolvedValue({ ok: true });
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un bot' }));
    const levels = screen.getAllByLabelText('Niveau');
    const counts = screen.getAllByLabelText('Nombre');
    expect(levels).toHaveLength(1);

    fireEvent.change(levels[0], { target: { value: 'expert' } });
    fireEvent.change(counts[0], { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un bot' }));
    fireEvent.click(screen.getAllByLabelText('Retirer ce bot')[1]);

    submitForm();

    await waitFor(() => expect(mockedUpdateRoomConfig).toHaveBeenCalledTimes(1));
    expect(mockedUpdateRoomConfig).toHaveBeenCalledWith({
      roomPublicId: ROOM_PUBLIC_ID,
      config: expect.objectContaining({
        bots: [{ level: 'expert', count: 3 }],
      }),
    });
  });

  test('a zero-count bot entry is dropped from the payload', async () => {
    mockedUpdateRoomConfig.mockResolvedValue({ ok: true });
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un bot' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '0' } });
    submitForm();

    await waitFor(() => expect(mockedUpdateRoomConfig).toHaveBeenCalledTimes(1));
    expect(mockedUpdateRoomConfig).toHaveBeenCalledWith({
      roomPublicId: ROOM_PUBLIC_ID,
      config: expect.objectContaining({ bots: [] }),
    });
  });

  test('switching to English disables and clears the accents option (CONF-06)', async () => {
    mockedUpdateRoomConfig.mockResolvedValue({ ok: true });
    renderEditor();

    fireEvent.change(screen.getByLabelText('Langue du texte'), { target: { value: 'en' } });

    const accents = screen.getByLabelText('Accents');
    expect(accents).toBeDisabled();
    expect(accents).not.toBeChecked();
    expect(screen.getByText('Les accents ne s’appliquent qu’au français.')).toBeInTheDocument();

    submitForm();

    await waitFor(() => expect(mockedUpdateRoomConfig).toHaveBeenCalledTimes(1));
    expect(mockedUpdateRoomConfig).toHaveBeenCalledWith({
      roomPublicId: ROOM_PUBLIC_ID,
      config: expect.objectContaining({
        textLanguage: 'en',
        options: expect.objectContaining({ accents: false }),
      }),
    });
  });

  test('submit sends the edited config to the action with the exact payload', async () => {
    mockedUpdateRoomConfig.mockResolvedValue({ ok: true });
    renderEditor();

    fireEvent.change(screen.getByLabelText('Langue du texte'), { target: { value: 'fr' } });
    fireEvent.change(screen.getByLabelText('Complexité'), { target: { value: 'difficile' } });
    fireEvent.change(screen.getByLabelText('Type de texte'), { target: { value: 'random' } });
    fireEvent.change(screen.getByLabelText('Nombre de mots'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Temps maximal'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Mode d’erreur'), { target: { value: 'stop' } });
    fireEvent.click(screen.getByLabelText('Ponctuation'));
    fireEvent.click(screen.getByLabelText('Bonus de remontée'));

    submitForm();

    await waitFor(() => expect(mockedUpdateRoomConfig).toHaveBeenCalledTimes(1));
    expect(mockedUpdateRoomConfig).toHaveBeenCalledWith({
      roomPublicId: ROOM_PUBLIC_ID,
      config: {
        textLanguage: 'fr',
        textComplexity: 'difficile',
        textType: 'random',
        wordCount: 120,
        timeLimitSeconds: null,
        errorMode: 'stop',
        options: { punctuation: false, numbers: true, capitals: true, accents: true },
        bonusesEnabled: false,
        bots: [],
      },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Configuration enregistrée');
  });

  test('a configLocked denial from the action shows the localized message', async () => {
    // The `configLocked` code lands with the en_attente guard (SP-2E unit 2);
    // the cast keeps this mapping test green before and after.
    mockedUpdateRoomConfig.mockResolvedValue({
      ok: false,
      error: 'configLocked',
    } as unknown as Awaited<ReturnType<typeof updateRoomConfig>>);
    renderEditor();

    submitForm();

    expect(await screen.findByText('La configuration est figée une fois la course lancée.')).toBeInTheDocument();
  });

  test('the draft re-syncs when the snapshot config changes (configUpdated)', () => {
    const { rerender } = renderEditor(defaultRoomConfig);

    expect(screen.getByLabelText('Nombre de mots')).toHaveValue(60);

    const updated: RoomConfig = { ...defaultRoomConfig, wordCount: 120 };
    rerender(
      <RaceConfigEditor
        config={updated}
        roomPublicId={ROOM_PUBLIC_ID}
        canEdit
        lockedReason={null}
        messages={messages}
      />,
    );

    expect(screen.getByLabelText('Nombre de mots')).toHaveValue(120);
  });
});

describe('buildConfigPayload (pure validation)', () => {
  test('round-trips a valid draft', () => {
    const draft = draftFromConfig(defaultRoomConfig);
    const result = buildConfigPayload(draft);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual(defaultRoomConfig);
    }
  });

  test('an empty time limit means none (CONF-01)', () => {
    const result = buildConfigPayload({ ...draftFromConfig(defaultRoomConfig), timeLimitSeconds: '  ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.timeLimitSeconds).toBeNull();
    }
  });

  test('a non-numeric word count is rejected', () => {
    const result = buildConfigPayload({ ...draftFromConfig(defaultRoomConfig), wordCount: 'abc' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.wordCount).toBe(true);
    }
  });
});
