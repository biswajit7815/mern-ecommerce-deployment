pipeline {
    agent any

    tools {
        nodejs 'node18'
        jdk 'jdk21'
    }

    environment {
        DOCKERHUB_USER = 'biswajit7815'
        BACKEND_IMAGE  = "${DOCKERHUB_USER}/mern-backend"
        FRONTEND_IMAGE = "${DOCKERHUB_USER}/mern-frontend"
        IMAGE_TAG      = "${BUILD_NUMBER}"
        SONAR_PROJECT  = 'mern-ecommerce'
        SCANNER_HOME   = tool 'sonar-scanner'
        TRIVY_CACHE    = '/var/lib/trivy'
        EC2_PUBLIC_IP  = "${env.EC2_PUBLIC_IP ?: '13.126.203.252'}"
    }

    triggers {
        githubPush()
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '5'))
        timeout(time: 60, unit: 'MINUTES')
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            parallel {
                stage('Backend Install') {
                    steps {
                        dir('backend') {
                            sh 'npm ci || npm install'
                        }
                    }
                }

                stage('Frontend Install') {
                    steps {
                        dir('frontend') {
                            sh 'npm ci --legacy-peer-deps || npm install --legacy-peer-deps'
                        }
                    }
                }
            }
        }

        stage('Security Scan') {
            steps {
                sh 'mkdir -p reports/trivy'
                sh """
                    trivy fs . \
                    --exit-code 0 \
                    --severity HIGH,CRITICAL \
                    --format table \
                    -o reports/trivy/fs.txt
                """
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('sonar-server') {
                    sh """
                        ${SCANNER_HOME}/bin/sonar-scanner \
                        -Dsonar.projectKey=${SONAR_PROJECT} \
                        -Dsonar.sources=backend/,frontend/src/
                    """
                }
            }
        }

        stage('Build Docker Images') {
            steps {
                sh """
                    docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} -t ${BACKEND_IMAGE}:latest -f backend/Dockerfile ./backend
                    docker build --build-arg REACT_APP_BASE_URL=http://${EC2_PUBLIC_IP} -t ${FRONTEND_IMAGE}:${IMAGE_TAG} -t ${FRONTEND_IMAGE}:latest -f frontend/Dockerfile ./frontend
                """
            }
        }

        stage('Push Images') {
            steps {
                withCredentials([
                    usernamePassword(credentialsId: 'docker-hub-creds', 
                                     usernameVariable: 'USER', 
                                     passwordVariable: 'PASS')
                ]) {
                    sh """
                        echo "\$PASS" | docker login -u "\$USER" --password-stdin
                        
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${BACKEND_IMAGE}:latest
                        
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:latest
                        
                        docker logout
                    """
                }
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([
                    string(credentialsId: 'MONGO_URI', variable: 'MONGO_URI'),
                    string(credentialsId: 'SECRET_KEY', variable: 'SECRET_KEY'),
                    string(credentialsId: 'EMAIL', variable: 'EMAIL'),
                    string(credentialsId: 'EMAIL_PASSWORD', variable: 'EMAIL_PASSWORD')
                ]) {
                    sh '''
                        echo "Creating backend .env..."
                        cat > backend/.env <<EOF
                        MONGO_URI=$MONGO_URI
                        SECRET_KEY=$SECRET_KEY
                        EMAIL=$EMAIL
                        EMAIL_PASSWORD=$EMAIL_PASSWORD
                        EOF
                        echo "Creating frontend .env..."
                        cat > frontend/.env <<EOF
                        REACT_APP_BASE_URL=http://13.126.203.252:8000
                        EOF

                        echo "Stopping old containers..."
                        docker compose down || true
                        
                        echo "Starting new containers..."
                        docker compose up -d --build
                        
                        sleep 15
                        docker ps
                    '''
                }
            }
        }

        stage('Cleanup') {
            steps {
                sh "docker image prune -f"
            }
        }
    }

    post {
        always {
            echo "Build finished"
        }
        success {
            echo "SUCCESS: App deployed at http://${EC2_PUBLIC_IP}"
        }
        failure {
            echo "FAILED: Check Jenkins logs"
        }
    }
}