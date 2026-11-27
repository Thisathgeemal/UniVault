// needs native-speaker review
/**
 * Sinhala (සිංහල) UI strings, in Unicode Sinhala script. Drafted by the developer for the
 * prototype (NFR-02); EVERY string still needs review by a native speaker before release.
 * Same shape as en.ts (enforced by the `Messages` type and a test). Terms follow the issuer
 * portal: credential = අක්තපත්‍රය, issuer = නිකුත්කරු, holder = හිමිකරු, wallet = පසුම්බිය.
 * Technical names (UniVault, SD-JWT, Expo, Hermes, API, crypto-core, GET /health, HTTP,
 * EXPO_PUBLIC_API_BASE_URL, wallet/.env) stay in Latin script.
 */
import type { Messages } from './en';

export const si: Messages = {
  app: {
    name: 'UniVault',
  },
  common: {
    tryAgain: 'නැවත උත්සාහ කරන්න',
    running: 'ක්‍රියාත්මක වෙමින්…',
  },
  language: {
    en: 'English',
    si: 'සිංහල',
  },
  tabs: {
    credentials: 'අක්තපත්‍ර',
    scan: 'ස්කෑන්',
    history: 'ඉතිහාසය',
    settings: 'සැකසුම්',
  },
  credentials: {
    title: 'මගේ අක්තපත්‍ර',
    emptyTitle: 'තවම අක්තපත්‍ර නැත',
    emptyMessage:
      'සේවා යෝජකයෙකුගෙන් හෝ බැංකුවකින් ඔබට ලැබෙන අක්තපත්‍ර මෙහි දිස්වේ. එකක් එක් කිරීමට, නිකුත්කරු පෙන්වන QR කේතය ස්කෑන් ටැබයෙන් ස්කෑන් කරන්න.',
  },
  scan: {
    title: 'QR කේතයක් ස්කෑන් කරන්න',
    emptyTitle: 'ස්කෑන් කිරීම ළඟදීම',
    emptyMessage:
      'මෙහිදී ඔබ QR කේත ස්කෑන් කරනු ඇත: නිකුත්කරුවෙකුගෙන් ලැබෙන අක්තපත්‍ර දීමනා, සහ ඔබගේ අක්තපත්‍රයක් පරීක්ෂා කිරීමට අවශ්‍ය ආයතනයක ඉල්ලීම්. කිසිවක් බෙදා ගැනීමට පෙර ඉල්ලන දේ ඔබට සැමවිටම පෙනෙනු ඇත.',
  },
  history: {
    title: 'ඉතිහාසය',
    emptyTitle: 'තවම ක්‍රියාකාරකම් නැත',
    emptyMessage:
      'ඔබට ලැබෙන අක්තපත්‍ර සහ ඔබ ඒවා බෙදා ගන්නා අය පිළිබඳ වාර්තාවක් මෙහි දිස්වේ. එය මෙම දුරකථනයේම පවතී.',
  },
  settings: {
    title: 'සැකසුම්',
    language: 'භාෂාව',
    languageHint: 'මුළු යෙදුමේම භාෂාව වෙනස් කරයි.',
    about: 'යෙදුම ගැන',
    appVersion: 'යෙදුමේ අනුවාදය',
    diagnostics: 'පද්ධති පරීක්ෂා',
    diagnosticsHint: 'සංවර්ධක පරීක්ෂා (සංවර්ධන අනුවාද සඳහා පමණි)',
  },
  diagnostics: {
    title: 'පද්ධති පරීක්ෂා',
    intro:
      'සංවර්ධකයින් සඳහා පරීක්ෂා. මේවා කෘත්‍රිම පරීක්ෂණ දත්ත පමණක් භාවිත කරන අතර අක්තපත්‍රවල අන්තර්ගතය කිසිවිට නොපෙන්වයි.',
    unavailable: 'පද්ධති පරීක්ෂා ලබා ගත හැක්කේ සංවර්ධන අනුවාදවල පමණි.',
    environment: 'යෙදුම සහ උපාංගය',
    appVersion: 'යෙදුමේ අනුවාදය',
    sdkVersion: 'Expo SDK',
    platform: 'වේදිකාව',
    hermes: 'Hermes එන්ජිම',
    on: 'සක්‍රියයි',
    off: 'අක්‍රියයි',
    apiBaseUrl: 'API මූලික ලිපිනය',
    apiProblem: {
      missing: 'සකසා නැත. wallet/.env වෙත EXPO_PUBLIC_API_BASE_URL එක් කර Expo නැවත ආරම්භ කරන්න.',
      placeholder:
        'තවමත් උදාහරණ අගයයි. ඔබගේ පරිගණකයේ LAN IP ලිපිනය wallet/.env හි දමා Expo නැවත ආරම්භ කරන්න.',
      invalid: 'වලංගු http(s) ලිපිනයක් නොවේ. wallet/.env හි EXPO_PUBLIC_API_BASE_URL පරීක්ෂා කරන්න.',
    },
    loopbackWarning:
      'මෙය දුරකථනයටම (localhost) යොමු වේ. සැබෑ දුරකථනයකට ඔබගේ පරිගණකයේ LAN IP ලිපිනය හෝ tunnel එකක් අවශ්‍යයි.',
    cryptoTitle: 'crypto-core පරීක්ෂාව',
    cryptoDescription:
      'යෙදුම සමඟ ඇති කෘත්‍රිම SD-JWT එකක් පොදු ගුප්ත කේතන පුස්තකාලයෙන් විකේතනය කර සෑම හෙළිදරව් කිරීමක digest එකක්ම පරීක්ෂා කරයි.',
    apiTitle: 'API වෙත ළඟා වීම',
    apiDescription: 'UniVault සේවාදායකයේ GET /health අමතයි.',
    run: 'පරීක්ෂාව ධාවනය කරන්න',
    runLabel: '{{name}} ධාවනය කරන්න',
    pass: 'සාර්ථකයි',
    fail: 'අසාර්ථකයි',
    notRun: 'තවම ධාවනය කර නැත',
    disclosures: 'හෙළිදරව් කිරීම් {{expected}} න් {{count}} ක් විකේතනය විය',
    duration: 'මිලි තත්පර {{ms}} ක් ගත විය',
    reason: 'හේතුව: {{reason}}',
    reachable: 'ළඟා විය හැක: සේවාදායක තත්ත්වය “{{status}}” (HTTP {{http}})',
    unreachable: 'ළඟා විය නොහැක ({{code}})',
    notConfigured: 'පළමුව API මූලික ලිපිනය සකසන්න.',
  },
  errors: {
    boundaryTitle: 'යම් දෝෂයක් සිදු විය',
    boundaryMessage: 'මෙම තිරයේ අනපේක්ෂිත ගැටලුවක් ඇති විය. ඔබගේ අක්තපත්‍රවලට කිසිදු බලපෑමක් නැත.',
  },
  notFound: {
    title: 'පිටුව හමු නොවීය',
    message: 'මෙම තිරය නොපවතී.',
    goHome: 'මගේ අක්තපත්‍ර වෙත යන්න',
  },
};
