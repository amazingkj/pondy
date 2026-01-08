package config

import (
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server  ServerConfig   `mapstructure:"server"`
	Storage StorageConfig  `mapstructure:"storage"`
	Targets []TargetConfig `mapstructure:"targets"`
}

type ServerConfig struct {
	Port int `mapstructure:"port"`
}

type StorageConfig struct {
	Path string `mapstructure:"path"`
}

type TargetConfig struct {
	Name     string        `mapstructure:"name"`
	Type     string        `mapstructure:"type"`
	Endpoint string        `mapstructure:"endpoint"`
	Interval time.Duration `mapstructure:"interval"`
}

func Load(path string) (*Config, error) {
	viper.SetConfigFile(path)
	viper.SetConfigType("yaml")

	viper.SetDefault("server.port", 8080)
	viper.SetDefault("storage.path", "./data/pondy.db")

	if err := viper.ReadInConfig(); err != nil {
		return nil, err
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
