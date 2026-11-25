// needs native-speaker review
/**
 * Sinhala (සිංහල) UI strings, in Unicode Sinhala script. Drafted by the developer for the
 * prototype (NFR-02); every string still needs review by a native speaker before release.
 * Same shape as en.ts (enforced by the `Messages` type and a test). Terms used:
 * issuer = නිකුත්කරු, credential = අක්තපත්‍රය, holder = හිමිකරු, session = සැසිය.
 */
import type { Messages } from './en.js';

export const si: Messages = {
  app: {
    name: 'UniVault නිකුත්කරු ද්වාරය',
    shortName: 'නිකුත්කරු ද්වාරය',
  },
  common: {
    loading: 'පූරණය වෙමින්…',
    tryAgain: 'නැවත උත්සාහ කරන්න',
    backToDashboard: 'උපකරණ පුවරුවට ආපසු යන්න',
    reference: 'යොමු අංකය: {{requestId}}',
  },
  language: {
    label: 'භාෂාව',
    en: 'English',
    si: 'සිංහල',
  },
  login: {
    title: 'පිවිසෙන්න',
    subtitle: 'නිකුත් කරන ආයතනවල (සේවා යෝජකයින් සහ බැංකු) කාර්ය මණ්ඩලය සඳහා.',
    email: 'විද්‍යුත් තැපැල් ලිපිනය',
    password: 'මුරපදය',
    showPassword: 'මුරපදය පෙන්වන්න',
    hidePassword: 'මුරපදය සඟවන්න',
    submit: 'පිවිසෙන්න',
    submitting: 'පිවිසෙමින්…',
    fieldErrors: {
      emailRequired: 'ඔබගේ විද්‍යුත් තැපැල් ලිපිනය ඇතුළත් කරන්න.',
      emailInvalid: 'name@example.com වැනි වලංගු විද්‍යුත් තැපැල් ලිපිනයක් ඇතුළත් කරන්න.',
      passwordRequired: 'ඔබගේ මුරපදය ඇතුළත් කරන්න.',
      passwordTooLong: 'මුරපදය දිග වැඩියි.',
    },
    errors: {
      invalidCredentials: 'විද්‍යුත් තැපැල් ලිපිනය හෝ මුරපදය නිවැරදි නොවේ.',
      accountLocked: 'අසාර්ථක පිවිසුම් උත්සාහයන් වැඩි ගණනක් නිසා මෙම ගිණුම අගුළු දමා ඇත. පසුව නැවත උත්සාහ කරන්න.',
      accountLockedUntil:
        'අසාර්ථක පිවිසුම් උත්සාහයන් වැඩි ගණනක් නිසා මෙම ගිණුම අගුළු දමා ඇත. {{time}} (ශ්‍රී ලංකා වේලාව) න් පසු නැවත උත්සාහ කරන්න.',
      rateLimited: 'මෙම උපාංගයෙන් පිවිසුම් උත්සාහයන් වැඩි ගණනක් සිදු වී ඇත. මිනිත්තු කිහිපයක් රැඳී සිට නැවත උත්සාහ කරන්න.',
      validation: 'වලංගු විද්‍යුත් තැපැල් ලිපිනයක් සහ ඔබගේ මුරපදය ඇතුළත් කරන්න.',
    },
  },
  session: {
    expired: 'ඔබගේ සැසිය කල් ඉකුත් වී ඇත, කරුණාකර නැවත පිවිසෙන්න.',
  },
  errors: {
    network: 'UniVault සේවාදායකයට සම්බන්ධ විය නොහැක. ඔබගේ සම්බන්ධතාවය පරීක්ෂා කර නැවත උත්සාහ කරන්න.',
    generic: 'යම් දෝෂයක් සිදු විය. කරුණාකර නැවත උත්සාහ කරන්න.',
    restoreFailed: {
      title: 'ඔබගේ සැසිය පූරණය කළ නොහැකි විය',
      message: 'UniVault සේවාදායකය ප්‍රතිචාර දැක්වූයේ නැත. ඔබගේ සම්බන්ධතාවය පරීක්ෂා කර නැවත උත්සාහ කරන්න.',
    },
    pageCrashed: {
      title: 'මෙම පිටුව පෙන්විය නොහැකි විය',
      message: 'මෙම පිටුවේ දෝෂයක් සිදු විය. පිටුව නැවත පූරණය කරන්න, නැතහොත් උපකරණ පුවරුවට ආපසු යන්න.',
      reload: 'පිටුව නැවත පූරණය කරන්න',
    },
    notFound: {
      title: 'පිටුව හමු නොවීය',
      message: 'ඔබ ඉල්ලූ පිටුව නොපවතී.',
    },
    notPermitted: {
      title: 'අවසර නැත',
      message: 'ඔබගේ භූමිකාවට මෙම පිටුවට ප්‍රවේශ වීමට අවසර නැත. අවශ්‍ය නම් පරිපාලකයෙකුගෙන් විමසන්න.',
    },
  },
  header: {
    signOut: 'ඉවත් වන්න',
    openMenu: 'මෙනුව විවෘත කරන්න',
    closeMenu: 'මෙනුව වසන්න',
    skipToContent: 'ප්‍රධාන අන්තර්ගතයට යන්න',
  },
  nav: {
    label: 'ප්‍රධාන සංචාලනය',
    dashboard: 'උපකරණ පුවරුව',
    holders: 'හිමිකරුවන්',
    credentials: 'අක්තපත්‍ර',
    credentialOffers: 'අක්තපත්‍ර පිරිනැමීම්',
    issuerKeys: 'නිකුත්කරු යතුරු',
    staff: 'කාර්ය මණ්ඩලය',
  },
  roles: {
    admin: 'පරිපාලක',
    officer: 'නිලධාරී',
  },
  issuerTypes: {
    employer: 'සේවා යෝජකයා',
    bank: 'බැංකුව',
  },
  dashboard: {
    welcome: 'ආයුබෝවන්, {{name}}',
    description: 'ඔබගේ ආයතනය සඳහා සත්‍යාපනය කළ හැකි අක්තපත්‍ර නිකුත් කර කළමනාකරණය කරන්න.',
    organisation: 'ආයතනය',
    role: 'ඔබගේ භූමිකාව',
    signedInAs: '{{email}} ලෙස පිවිස ඇත',
  },
  comingSoon: {
    badge: 'ඉක්මනින් පැමිණේ',
    description: 'මෙම පිටුව {{sprint}} වන ස්ප්‍රින්ට් එක සඳහා සැලසුම් කර ඇත.',
  },
};
