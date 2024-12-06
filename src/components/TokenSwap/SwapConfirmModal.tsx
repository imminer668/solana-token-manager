import React, { useState } from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    Button,
    Text,
    VStack,
    HStack,
    Divider,
    Box,
    Flex,
    Badge,
    useColorModeValue,
    Icon,
    Spinner,
    useDisclosure,
    AlertDialog,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
} from '@chakra-ui/react';
import { FaArrowDown, FaInfoCircle } from 'react-icons/fa';

interface SwapConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    tokenA: any;
    tokenB: any;
    amountIn: string;
    amountOut: string;
    exchangeRate: string | null;
    priceImpact: string | null;
    slippage: number;
    onConfirm: () => void;
    isSwapping: boolean;
}

export const SwapConfirmModal: React.FC<SwapConfirmModalProps> = ({
    isOpen,
    onClose,
    tokenA,
    tokenB,
    amountIn,
    amountOut,
    exchangeRate,
    priceImpact,
    slippage,
    onConfirm,
    isSwapping
}) => {
    const { isOpen: isAlertOpen, onOpen: onAlertOpen, onClose: onAlertClose } = useDisclosure();
    const cancelRef = React.useRef<HTMLButtonElement>(null);
    
    const handleClose = () => {
        if (isSwapping) {
            onAlertOpen();
        } else {
            onClose();
        }
    };
    
    const handleForceClose = () => {
        onAlertClose();
        onClose();
    };

    const borderColor = useColorModeValue('gray.200', 'gray.700');
    const bgColor = useColorModeValue('gray.50', 'gray.700');
    const textColor = useColorModeValue('gray.800', 'white');
    const secondaryTextColor = useColorModeValue('gray.600', 'gray.400');

    return (
        <>
            <Modal 
                isOpen={isOpen} 
                onClose={handleClose}
                isCentered
                closeOnOverlayClick={false}
                closeOnEsc={!isSwapping}
            >
                <ModalOverlay backdropFilter="blur(4px)" />
                <ModalContent borderRadius="xl" p={2}>
                    <ModalHeader fontSize="xl" fontWeight="bold">确认兑换</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <VStack spacing={6} align="stretch">
                            {/* 代币卡片 */}
                            <Box 
                                p={4} 
                                borderWidth="1px" 
                                borderColor={borderColor} 
                                borderRadius="xl"
                                bg={bgColor}
                            >
                                <HStack justify="space-between" mb={2}>
                                    <Text fontSize="sm" color={secondaryTextColor}>支付</Text>
                                    <Text fontSize="sm" color={secondaryTextColor}>
                                        余额: {tokenA?.balance?.toFixed(4) || '0'}
                                    </Text>
                                </HStack>
                                <HStack justify="space-between">
                                    <HStack>
                                        {tokenA?.icon && (
                                            <Box boxSize="32px" borderRadius="full" overflow="hidden">
                                                <img src={tokenA.icon} alt={tokenA.symbol} />
                                            </Box>
                                        )}
                                        <Text fontSize="xl" fontWeight="bold">{tokenA?.symbol}</Text>
                                    </HStack>
                                    <Text fontSize="xl" fontWeight="bold">{amountIn}</Text>
                                </HStack>
                            </Box>

                            {/* 箭头 */}
                            <Flex justify="center">
                                <Box 
                                    p={2} 
                                    bg="blue.500" 
                                    borderRadius="full" 
                                    color="white"
                                >
                                    <FaArrowDown />
                                </Box>
                            </Flex>

                            {/* 接收代币卡片 */}
                            <Box 
                                p={4} 
                                borderWidth="1px" 
                                borderColor={borderColor} 
                                borderRadius="xl"
                                bg={bgColor}
                            >
                                <HStack justify="space-between" mb={2}>
                                    <Text fontSize="sm" color={secondaryTextColor}>接收 (估计)</Text>
                                    <Text fontSize="sm" color={secondaryTextColor}>
                                        余额: {tokenB?.balance?.toFixed(4) || '0'}
                                    </Text>
                                </HStack>
                                <HStack justify="space-between">
                                    <HStack>
                                        {tokenB?.icon && (
                                            <Box boxSize="32px" borderRadius="full" overflow="hidden">
                                                <img src={tokenB.icon} alt={tokenB.symbol} />
                                            </Box>
                                        )}
                                        <Text fontSize="xl" fontWeight="bold">{tokenB?.symbol}</Text>
                                    </HStack>
                                    <Text fontSize="xl" fontWeight="bold">{amountOut}</Text>
                                </HStack>
                            </Box>

                            {/* 交易详情 */}
                            <VStack spacing={3} p={4} borderWidth="1px" borderColor={borderColor} borderRadius="xl" bg={bgColor}>
                                <Flex w="full" justify="space-between">
                                    <Text color={secondaryTextColor}>兑换比率</Text>
                                    <Text fontWeight="medium">{exchangeRate || '-'}</Text>
                                </Flex>
                                
                                <Flex w="full" justify="space-between">
                                    <HStack>
                                        <Text color={secondaryTextColor}>价格影响</Text>
                                        <Icon as={FaInfoCircle} color={secondaryTextColor} boxSize={3} />
                                    </HStack>
                                    <Badge 
                                        colorScheme={
                                            priceImpact && parseFloat(priceImpact) > 5 
                                                ? "red" 
                                                : priceImpact && parseFloat(priceImpact) > 1 
                                                    ? "yellow" 
                                                    : "green"
                                        }
                                    >
                                        {priceImpact ? `${priceImpact}%` : '0.00%'}
                                    </Badge>
                                </Flex>
                                
                                <Flex w="full" justify="space-between">
                                    <HStack>
                                        <Text color={secondaryTextColor}>最小接收</Text>
                                        <Icon as={FaInfoCircle} color={secondaryTextColor} boxSize={3} />
                                    </HStack>
                                    <Text fontWeight="medium">
                                        {parseFloat(amountOut) * (1 - slippage / 100).toFixed(tokenB?.decimals || 6)} {tokenB?.symbol}
                                    </Text>
                                </Flex>
                                
                                <Flex w="full" justify="space-between">
                                    <HStack>
                                        <Text color={secondaryTextColor}>滑点容忍度</Text>
                                        <Icon as={FaInfoCircle} color={secondaryTextColor} boxSize={3} />
                                    </HStack>
                                    <Text fontWeight="medium">{slippage}%</Text>
                                </Flex>
                            </VStack>
                        </VStack>
                    </ModalBody>

                    <ModalFooter>
                        <Button 
                            variant="outline" 
                            mr={3} 
                            onClick={handleClose}
                            borderRadius="xl"
                            isDisabled={isSwapping}
                        >
                            取消
                        </Button>
                        <Button 
                            colorScheme="blue" 
                            onClick={onConfirm} 
                            isLoading={isSwapping}
                            loadingText="处理中"
                            borderRadius="xl"
                        >
                            确认兑换
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            
            <AlertDialog
                isOpen={isAlertOpen}
                leastDestructiveRef={cancelRef}
                onClose={onAlertClose}
                isCentered
            >
                <AlertDialogOverlay>
                    <AlertDialogContent borderRadius="xl">
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            交易正在处理中
                        </AlertDialogHeader>
                        
                        <AlertDialogBody py={4}>
                            <VStack spacing={4} align="stretch">
                                <Text>
                                    您的交易正在区块链上处理，关闭此窗口不会取消交易。
                                </Text>
                                <Text>
                                    建议等待交易完成后再关闭，以便您能看到交易结果。
                                </Text>
                                <Text fontWeight="bold" color="orange.500">
                                    您确定要关闭此窗口吗？
                                </Text>
                            </VStack>
                        </AlertDialogBody>
                        
                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={onAlertClose}>
                                继续等待
                            </Button>
                            <Button colorScheme="red" onClick={handleForceClose} ml={3}>
                                关闭窗口
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </>
    );
}; 