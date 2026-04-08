declare const config: {
    darkMode: ["class"];
    content: string[];
    theme: {
        extend: {
            borderRadius: {
                lg: string;
                md: string;
                sm: string;
            };
            colors: {
                background: string;
                foreground: string;
                card: {
                    DEFAULT: string;
                    foreground: string;
                };
                popover: {
                    DEFAULT: string;
                    foreground: string;
                };
                primary: {
                    DEFAULT: string;
                    foreground: string;
                };
                secondary: {
                    DEFAULT: string;
                    foreground: string;
                };
                muted: {
                    DEFAULT: string;
                    foreground: string;
                };
                accent: {
                    DEFAULT: string;
                    foreground: string;
                };
                destructive: {
                    DEFAULT: string;
                    foreground: string;
                };
                sidebar: {
                    DEFAULT: string;
                    foreground: string;
                    primary: string;
                    "primary-foreground": string;
                    accent: string;
                    "accent-foreground": string;
                    border: string;
                    ring: string;
                };
                border: string;
                input: string;
                ring: string;
            };
            keyframes: {
                "accordion-down": {
                    from: {
                        height: string;
                    };
                    to: {
                        height: string;
                    };
                };
                "accordion-up": {
                    from: {
                        height: string;
                    };
                    to: {
                        height: string;
                    };
                };
            };
            animation: {
                "accordion-down": string;
                "accordion-up": string;
            };
        };
    };
    plugins: any[];
};
export default config;
