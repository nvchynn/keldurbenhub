#!/bin/bash

# KeldurbenHub Server - Complete Deployment Script for Ubuntu 24.04 VDS
# This script provides multiple deployment options

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_warning "Running as root is not recommended for security reasons"
   print_warning "Consider creating a regular user: adduser keldurben && usermod -aG sudo keldurben"
   read -p "Do you want to continue anyway? (y/N): " -n 1 -r
   echo
   if [[ ! $REPLY =~ ^[Yy]$ ]]; then
       print_error "Exiting for security reasons"
       exit 1
   fi
fi

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  docker     Deploy using Docker (recommended)"
    echo "  native     Deploy natively on Ubuntu"
    echo "  help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 docker    # Deploy with Docker"
    echo "  $0 native    # Deploy natively"
}

# Function to check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        print_error "Cannot determine OS version"
        exit 1
    fi
    
    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        print_warning "This script is optimized for Ubuntu. Other distributions may work but are not tested."
    fi
    
    # Check available memory
    MEMORY_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    MEMORY_GB=$((MEMORY_KB / 1024 / 1024))
    
    if [[ $MEMORY_GB -lt 1 ]]; then
        print_warning "System has less than 1GB RAM. Performance may be affected."
    fi
    
    # Check available disk space
    DISK_SPACE=$(df / | tail -1 | awk '{print $4}')
    DISK_SPACE_GB=$((DISK_SPACE / 1024 / 1024))
    
    if [[ $DISK_SPACE_GB -lt 2 ]]; then
        print_error "Insufficient disk space. At least 2GB required."
        exit 1
    fi
    
    print_status "System requirements check passed"
}

# Function to deploy with Docker
deploy_docker() {
    print_header "Docker Deployment"
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_status "Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
        rm get-docker.sh
        print_warning "Please log out and log back in for Docker group changes to take effect"
        print_warning "Then run this script again"
        exit 0
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_status "Installing Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
    fi
    
    # Copy frontend files
    print_status "Preparing frontend files..."
    chmod +x copy-frontend.sh
    ./copy-frontend.sh
    
    # Run Docker deployment
    cd deploy
    chmod +x deploy-docker.sh
    ./deploy-docker.sh
    
    print_status "Docker deployment completed!"
}

# Function to deploy natively
deploy_native() {
    print_header "Native Deployment"
    
    # Check if Rust is installed
    if ! command -v rustc &> /dev/null; then
        print_status "Installing Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source $HOME/.cargo/env
        print_warning "Rust installed. Please run 'source ~/.cargo/env' or restart your shell"
    fi
    
    # Copy frontend files
    print_status "Preparing frontend files..."
    chmod +x copy-frontend.sh
    ./copy-frontend.sh
    
    # Run native deployment
    cd deploy
    chmod +x deploy.sh
    ./deploy.sh
    
    print_status "Native deployment completed!"
}

# Main script logic
main() {
    print_header "KeldurbenHub Server Deployment"
    print_status "Welcome to KeldurbenHub Server deployment script!"
    print_status "This script will help you deploy the server on Ubuntu 24.04 VDS"
    
    # Check requirements
    check_requirements
    
    # Parse command line arguments
    case "${1:-}" in
        "docker")
            deploy_docker
            ;;
        "native")
            deploy_native
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        "")
            print_status "No deployment method specified. Please choose:"
            echo ""
            echo "1) Docker (recommended for most users)"
            echo "2) Native (for advanced users)"
            echo ""
            read -p "Enter your choice (1 or 2): " choice
            
            case $choice in
                1)
                    deploy_docker
                    ;;
                2)
                    deploy_native
                    ;;
                *)
                    print_error "Invalid choice. Exiting."
                    exit 1
                    ;;
            esac
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
    
    print_header "Deployment Complete"
    print_status "Your KeldurbenHub server should now be running!"
    print_status "Check the status with:"
    echo "  - Docker: docker-compose ps (in deploy/ directory)"
    echo "  - Native: sudo systemctl status keldurben-server"
    print_status "View logs with:"
    echo "  - Docker: docker-compose logs -f (in deploy/ directory)"
    echo "  - Native: sudo journalctl -u keldurben-server -f"
}

# Run main function
main "$@"
