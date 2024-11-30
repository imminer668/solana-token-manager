import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    VStack,
    HStack,
    Text,
    Divider,
    Box,
    Image,
    Spinner,
} from '@chakra-ui/react';
import { TokenInfo } from './types';

interface SwapConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    tokenA: TokenInfo;
    tokenB: TokenInfo;
    amountIn: string;
    amountOut: string;
    exchangeRate: string;
    priceImpact: string;
    minimumReceived: string;
    slippage: number;
    isLoading?: boolean;
}

export const SwapConfirmModal: React.FC<SwapConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    tokenA,
    tokenB,
    amountIn,
    amountOut,
    exchangeRate,
    priceImpact,
    minimumReceived,
    slippage,
    isLoading = false,
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} isCentered>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>确认兑换</ModalHeader>
                <ModalBody>
                    <VStack spacing={4} align="stretch">
                        <HStack justify="space-between">
                            <HStack>
                                {tokenA.icon && (
                                    <Image src={tokenA.icon} boxSize="24px" borderRadius="full" />
                                )}
                                <Text>{amountIn}</Text>
                                <Text>{tokenA.symbol}</Text>
                            </HStack>
                            <Text color="gray.500">支付</Text>
                        </HStack>

                        <HStack justify="space-between">
                            <HStack>
                                {tokenB.icon && (
                                    <Image src={tokenB.icon} boxSize="24px" borderRadius="full" />
                                )}
                                <Text>{amountOut}</Text>
                                <Text>{tokenB.symbol}</Text>
                            </HStack>
                            <Text color="gray.500">获得</Text>
                        </HStack>

                        <Divider />

                        <VStack align="stretch" spacing={2}>
                            <HStack justify="space-between">
                                <Text color="gray.500">兑换比率</Text>
                                <Text>{exchangeRate}</Text>
                            </HStack>

                            <HStack justify="space-between">
                                <Text color="gray.500">价格影响</Text>
                                <Text color={Number(priceImpact) > 5 ? "red.500" : "gray.500"}>
                                    {priceImpact}%
                                </Text>
                            </HStack>

                            <HStack justify="space-between">
                                <Text color="gray.500">最小获得</Text>
                                <Text>{minimumReceived} {tokenB.symbol}</Text>
                            </HStack>

                            <HStack justify="space-between">
                                <Text color="gray.500">滑点容忍度</Text>
                                <Text>{slippage}%</Text>
                            </HStack>
                        </VStack>
                    </VStack>
                </ModalBody>

                <ModalFooter>
                    <Button variant="ghost" mr={3} onClick={onClose}>
                        取消
                    </Button>
                    <Button 
                        colorScheme="blue" 
                        onClick={onConfirm}
                        isLoading={isLoading}
                        loadingText="确认中..."
                    >
                        确认兑换
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}; 