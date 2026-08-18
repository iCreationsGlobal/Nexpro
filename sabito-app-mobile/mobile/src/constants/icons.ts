/**
 * Icon Library Setup for Sabito Mobile App
 * 
 * We use two icon libraries:
 * 1. Lucide React Native - Modern, consistent icons
 * 2. Expo Vector Icons - Material Icons, FontAwesome, etc.
 */

// Lucide Icons (Recommended for most use cases)
export {
  Home,
  Users,
  Building2,
  Briefcase,
  CreditCard,
  TrendingUp,
  FileText,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Check,
  AlertCircle,
  Info,
  Eye,
  EyeOff,
  Mail,
  Lock,
  Phone,
  Calendar,
  Clock,
  Search,
  Filter,
  Edit,
  Trash2,
  Download,
  Upload,
  Share2,
  Bell,
  BellOff,
  Star,
  Heart,
  Bookmark,
  MessageSquare,
  Send,
  Copy,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  MoreVertical,
  MoreHorizontal,
  Camera,
  Image as ImageIcon,
  File,
  FileCheck,
  Loader,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  UserPlus,
  UserMinus,
  UserCheck,
  Users2,
  Building,
  MapPin,
  Globe,
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  Wifi,
  WifiOff,
  Database,
  Cloud,
  CloudOff,
  Wallet,
  Receipt,
  ShoppingCart,
  Package,
  Truck,
  Gift,
  Tag,
  Percent,
  BarChart,
  PieChart,
  LineChart,
  Activity,
  Zap,
  Target,
  Award,
  TrendingDown,
} from 'lucide-react-native';

// Expo Vector Icons
// Import when needed like this:
// import { MaterialIcons } from '@expo/vector-icons';
// import { FontAwesome } from '@expo/vector-icons';
// import { Ionicons } from '@expo/vector-icons';

/**
 * Icon Sizes
 */
export const ICON_SIZES = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
  xxl: 48,
} as const;

/**
 * Default Icon Props
 */
export const DEFAULT_ICON_PROPS = {
  size: ICON_SIZES.md,
  strokeWidth: 2,
} as const;

export default {
  ICON_SIZES,
  DEFAULT_ICON_PROPS,
};





