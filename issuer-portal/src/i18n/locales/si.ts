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
    rateLimited: 'ඉල්ලීම් වැඩිය. මිනිත්තුවක් රැඳී සිට නැවත උත්සාහ කරන්න.',
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
    lastUpdated: 'අවසන් වරට යාවත්කාලීන කළේ {{time}} (ශ්‍රී ලංකා වේලාව)',
    refresh: 'නැවුම් කරන්න',
    refreshing: 'නැවුම් කරමින්…',
    loading: 'උපකරණ පුවරුව පූරණය වෙමින්…',
    loadFailed: 'උපකරණ පුවරුව පූරණය කළ නොහැකි විය.',
    primaryLabel: 'අක්තපත්‍ර එකතුව',
    secondaryLabel: 'තවත් සංඛ්‍යා',
    cards: {
      issued: {
        label: 'නිකුත් කළ',
        description: 'මෙතෙක් හිමිකරුවන්ගේ පසුම්බිවලට අත්සන් කර ලබා දුන් අක්තපත්‍ර',
      },
      active: {
        label: 'සක්‍රිය',
        description: 'දැනට හිමිකරුවන්ගේ පසුම්බිවල වලංගු අක්තපත්‍ර',
      },
      revoked: {
        label: 'අවලංගු කළ',
        description: 'නිකුත් කිරීමෙන් පසු ඉවත් කරගත් අක්තපත්‍ර',
      },
      awaitingWallet: {
        label: 'පසුම්බිය සඳහා රැඳී ඇති',
        description: 'සාදා ඇත, හිමිකරු QR කේතය ස්කෑන් කරන තෙක් රැඳී සිටී',
      },
      superseded: {
        label: 'ප්‍රතිස්ථාපිත',
        description: 'නව අක්තපත්‍රයකින් ප්‍රතිස්ථාපනය කළ',
      },
      expired: {
        label: 'කල් ඉකුත් වූ',
        description: 'කල් ඉකුත් වීමේ දිනය පසු කළ',
      },
      expiringSoon: {
        label: 'දින {{days}}ක් තුළ කල් ඉකුත් වන',
        description: 'ළඟදීම කල් ඉකුත් වන සක්‍රිය අක්තපත්‍ර',
      },
      holders: {
        label: 'හිමිකරුවන්',
        description: 'ඔබගේ ආයතනයේ හිමිකරු වාර්තා',
      },
    },
    breakdown: {
      title: 'නිකුත් කළ අක්තපත්‍රවල තත්ත්වය',
      noneIssued: 'තවමත් කිසිදු අක්තපත්‍රයක් පසුම්බියකට අත්සන් කර නැත.',
      value: '{{count}} ({{percent}})',
    },
    activity: {
      title: 'මෑත ක්‍රියාකාරකම්',
      empty: 'තවමත් ක්‍රියාකාරකම් නැත.',
      byWallet: 'හිමිකරුගේ පසුම්බිය',
      credential: 'අක්තපත්‍රය {{id}}',
      actions: {
        created: 'සාදන ලදී – පසුම්බිය සඳහා රැඳී ඇත',
        signed: 'පසුම්බියට අත්සන් කර ලබා දෙන ලදී',
        superseded: 'නව අක්තපත්‍රයකින් ප්‍රතිස්ථාපනය කරන ලදී',
        revoked: 'අවලංගු කරන ලදී – {{reason}}',
        expirySimulated: 'කල් ඉකුත්වීම අනුකරණය කරන ලදී (සංවර්ධන)',
        other: 'තත්ත්වය වෙනස් විය',
      },
      reasons: {
        details_changed: 'විස්තර වෙනස් විය',
        employment_ended: 'රැකියාව අවසන් විය',
        relationship_ended: 'සම්බන්ධතාවය අවසන් විය',
        wallet_lost_or_compromised: 'පසුම්බිය නැති වී හෝ අනාරක්ෂිත වී ඇත',
        issued_in_error: 'වැරදීමකින් නිකුත් කළ',
        validity_extension: 'වලංගු කාලය දීර්ඝ කළ',
        other: 'වෙනත් හේතුවක්',
        unknown: 'හේතුවක් දක්වා නැත',
      },
    },
    empty: {
      title: 'තවමත් අක්තපත්‍ර නිකුත් කර නැත',
      description:
        'හිමිකරු වාර්තාවක් එක් කිරීමෙන් අරඹන්න. ඉන්පසු අක්තපත්‍රයක් සාදා එහි QR කේතය හිමිකරුට පෙන්වන්න; හිමිකරු එය UniVault පසුම්බියෙන් ස්කෑන් කරයි.',
      action: 'හිමිකරුවන් වෙත යන්න',
    },
  },
  credentialTypes: {
    EmploymentCredential: 'රැකියා අක්තපත්‍රය',
    KYCCredential: 'KYC අක්තපත්‍රය',
  },
  comingSoon: {
    badge: 'ඉක්මනින් පැමිණේ',
    description: 'මෙම පිටුව {{sprint}} වන ස්ප්‍රින්ට් එක සඳහා සැලසුම් කර ඇත.',
  },
};
